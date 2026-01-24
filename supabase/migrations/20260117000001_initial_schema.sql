-- =====================================================
-- Initial Schema Migration
-- Dutch Supermarket Discount Aggregator App
-- =====================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================
-- Table: supermarkets
-- Stores information about Dutch supermarket chains
-- =====================================================
CREATE TABLE supermarkets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(100) NOT NULL,
  slug VARCHAR(50) UNIQUE NOT NULL,
  logo_url TEXT,
  website_url TEXT,
  primary_color VARCHAR(7), -- Hex color code
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add comment
COMMENT ON TABLE supermarkets IS 'Dutch supermarket chains that we scrape';

-- =====================================================
-- Table: categories
-- Product categories for classification
-- =====================================================
CREATE TABLE categories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(100) NOT NULL,
  slug VARCHAR(50) UNIQUE NOT NULL,
  icon_name VARCHAR(50), -- Icon identifier for mobile app
  created_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE categories IS 'Product categories for organizing discounts';

-- =====================================================
-- Table: products
-- Discount products scraped from supermarkets
-- =====================================================
CREATE TABLE products (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  supermarket_id UUID NOT NULL REFERENCES supermarkets(id) ON DELETE CASCADE,
  category_id UUID REFERENCES categories(id) ON DELETE SET NULL,

  -- Product information
  title VARCHAR(255) NOT NULL,
  description TEXT,

  -- Pricing
  original_price DECIMAL(10, 2),
  discount_price DECIMAL(10, 2) NOT NULL,
  discount_percentage INTEGER,

  -- Images
  image_url TEXT, -- Original image URL from supermarket
  image_storage_path TEXT, -- Path in Supabase Storage

  -- Additional info
  product_url TEXT, -- Link to product on supermarket website
  unit_info VARCHAR(100), -- e.g., "per kg", "per stuk", "500g"

  -- Validity
  valid_from DATE NOT NULL,
  valid_until DATE NOT NULL,

  -- Status
  is_active BOOLEAN DEFAULT true,

  -- Deduplication
  scrape_hash VARCHAR(64) UNIQUE, -- SHA-256 hash for deduplication

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Constraints
  CONSTRAINT valid_price_range CHECK (discount_price >= 0),
  CONSTRAINT valid_original_price CHECK (original_price IS NULL OR original_price >= discount_price),
  CONSTRAINT valid_discount_percentage CHECK (discount_percentage IS NULL OR (discount_percentage >= 0 AND discount_percentage <= 100)),
  CONSTRAINT valid_date_range CHECK (valid_until >= valid_from)
);

COMMENT ON TABLE products IS 'Discount products scraped from supermarket websites';

-- =====================================================
-- Table: user_favorites
-- User's favorited products (requires Supabase Auth)
-- =====================================================
CREATE TABLE user_favorites (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- Ensure a user can't favorite the same product twice
  UNIQUE(user_id, product_id)
);

COMMENT ON TABLE user_favorites IS 'Products favorited by authenticated users';

-- =====================================================
-- Table: scrape_logs
-- Logs for tracking scraper execution and errors
-- =====================================================
CREATE TABLE scrape_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  supermarket_id UUID REFERENCES supermarkets(id) ON DELETE SET NULL,

  -- Execution info
  status VARCHAR(20) NOT NULL CHECK (status IN ('success', 'failed', 'partial')),
  products_scraped INTEGER DEFAULT 0,
  error_message TEXT,
  duration_seconds INTEGER,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE scrape_logs IS 'Logs of scraper execution for monitoring';

-- =====================================================
-- Indexes for Performance
-- =====================================================

-- Products table indexes
CREATE INDEX idx_products_supermarket ON products(supermarket_id);
CREATE INDEX idx_products_category ON products(category_id);
CREATE INDEX idx_products_valid_dates ON products(valid_from, valid_until);
CREATE INDEX idx_products_active ON products(is_active);
CREATE INDEX idx_products_discount_price ON products(discount_price);
CREATE INDEX idx_products_created_at ON products(created_at DESC);
CREATE INDEX idx_products_scrape_hash ON products(scrape_hash);

-- User favorites index
CREATE INDEX idx_user_favorites_user ON user_favorites(user_id);
CREATE INDEX idx_user_favorites_product ON user_favorites(product_id);
CREATE INDEX idx_user_favorites_created_at ON user_favorites(created_at DESC);

-- Scrape logs index
CREATE INDEX idx_scrape_logs_status ON scrape_logs(status, created_at);
CREATE INDEX idx_scrape_logs_supermarket ON scrape_logs(supermarket_id, created_at DESC);

-- =====================================================
-- Functions for automatic timestamp updates
-- =====================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger for supermarkets table
CREATE TRIGGER update_supermarkets_updated_at
  BEFORE UPDATE ON supermarkets
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Trigger for products table
CREATE TRIGGER update_products_updated_at
  BEFORE UPDATE ON products
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- Function to deactivate expired products
-- (Call this from cleanup workflow)
-- =====================================================

CREATE OR REPLACE FUNCTION deactivate_expired_products()
RETURNS INTEGER AS $$
DECLARE
  affected_rows INTEGER;
BEGIN
  UPDATE products
  SET is_active = false
  WHERE valid_until < CURRENT_DATE
    AND is_active = true;

  GET DIAGNOSTICS affected_rows = ROW_COUNT;
  RETURN affected_rows;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION deactivate_expired_products IS 'Deactivate products that have expired (past valid_until date)';

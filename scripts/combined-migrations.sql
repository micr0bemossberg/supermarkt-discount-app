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
-- =====================================================
-- Seed Data Migration
-- Dutch Supermarket Discount Aggregator App
-- =====================================================

-- =====================================================
-- Seed: Supermarkets
-- Insert the 3 MVP supermarkets (AH, Jumbo, Lidl)
-- =====================================================

INSERT INTO supermarkets (name, slug, website_url, primary_color, is_active) VALUES
  (
    'Albert Heijn',
    'ah',
    'https://www.ah.nl/bonus',
    '#0066CC', -- AH Blue
    true
  ),
  (
    'Jumbo',
    'jumbo',
    'https://www.jumbo.com/aanbiedingen',
    '#FFD700', -- Jumbo Yellow
    true
  ),
  (
    'Lidl',
    'lidl',
    'https://www.lidl.nl/aanbiedingen',
    '#0050AA', -- Lidl Blue
    true
  );

-- =====================================================
-- Seed: Categories
-- Insert common product categories
-- =====================================================

INSERT INTO categories (name, slug, icon_name) VALUES
  ('Vers & Gebak', 'vers-gebak', 'bread-slice'),
  ('Vlees, Vis & Vega', 'vlees-vis-vega', 'fish'),
  ('Zuivel & Eieren', 'zuivel-eieren', 'cheese'),
  ('Groente & Fruit', 'groente-fruit', 'apple'),
  ('Diepvries', 'diepvries', 'snowflake'),
  ('Dranken', 'dranken', 'cup'),
  ('Bewaren', 'bewaren', 'package'),
  ('Ontbijt', 'ontbijt', 'coffee'),
  ('Snoep & Chips', 'snoep-chips', 'candy'),
  ('Persoonlijke Verzorging', 'persoonlijke-verzorging', 'account'),
  ('Huishouden', 'huishouden', 'home'),
  ('Overig', 'overig', 'dots-horizontal');

-- Add comments
COMMENT ON TABLE supermarkets IS 'Seeded with 3 MVP supermarkets: AH, Jumbo, Lidl';
COMMENT ON TABLE categories IS 'Seeded with common Dutch product categories';
-- =====================================================
-- Row Level Security (RLS) Policies
-- Dutch Supermarket Discount Aggregator App
-- =====================================================

-- =====================================================
-- Enable RLS on all tables
-- =====================================================
-- kjjhkhj
ALTER TABLE supermarkets ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_favorites ENABLE ROW LEVEL SECURITY;
ALTER TABLE scrape_logs ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- Supermarkets Table Policies
-- Public read access, service role only for writes
-- =====================================================

-- Public can read all active supermarkets
CREATE POLICY "Public read supermarkets"
  ON supermarkets
  FOR SELECT
  USING (is_active = true);

-- Service role can insert supermarkets
CREATE POLICY "Service role insert supermarkets"
  ON supermarkets
  FOR INSERT
  WITH CHECK (auth.jwt()->>'role' = 'service_role');

-- Service role can update supermarkets
CREATE POLICY "Service role update supermarkets"
  ON supermarkets
  FOR UPDATE
  USING (auth.jwt()->>'role' = 'service_role');

-- =====================================================
-- Categories Table Policies
-- Public read access
-- =====================================================

-- Public can read all categories
CREATE POLICY "Public read categories"
  ON categories
  FOR SELECT
  USING (true);

-- =====================================================
-- Products Table Policies
-- Public read for active products, service role for writes
-- =====================================================

-- Public can read all active products
CREATE POLICY "Public read active products"
  ON products
  FOR SELECT
  USING (is_active = true);

-- Service role can insert products (from scraper)
CREATE POLICY "Service role insert products"
  ON products
  FOR INSERT
  WITH CHECK (auth.jwt()->>'role' = 'service_role');

-- Service role can update products
CREATE POLICY "Service role update products"
  ON products
  FOR UPDATE
  USING (auth.jwt()->>'role' = 'service_role');

-- Service role can delete products
CREATE POLICY "Service role delete products"
  ON products
  FOR DELETE
  USING (auth.jwt()->>'role' = 'service_role');

-- =====================================================
-- User Favorites Table Policies
-- Users can only manage their own favorites
-- =====================================================

-- Users can read their own favorites
CREATE POLICY "Users read own favorites"
  ON user_favorites
  FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own favorites
CREATE POLICY "Users insert own favorites"
  ON user_favorites
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can delete their own favorites
CREATE POLICY "Users delete own favorites"
  ON user_favorites
  FOR DELETE
  USING (auth.uid() = user_id);

-- =====================================================
-- Scrape Logs Table Policies
-- Service role only (internal monitoring)
-- =====================================================

-- Service role can read all scrape logs
CREATE POLICY "Service role read scrape_logs"
  ON scrape_logs
  FOR SELECT
  USING (auth.jwt()->>'role' = 'service_role');

-- Service role can insert scrape logs
CREATE POLICY "Service role insert scrape_logs"
  ON scrape_logs
  FOR INSERT
  WITH CHECK (auth.jwt()->>'role' = 'service_role');

-- =====================================================
-- Helper Function: Get user's favorite product IDs
-- For efficient queries in mobile app
-- =====================================================

CREATE OR REPLACE FUNCTION get_user_favorite_product_ids(user_uuid UUID)
RETURNS TABLE(product_id UUID) AS $$
BEGIN
  RETURN QUERY
  SELECT user_favorites.product_id
  FROM user_favorites
  WHERE user_favorites.user_id = user_uuid;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- Comments
-- =====================================================

COMMENT ON POLICY "Public read active products" ON products IS
  'Allow public (anonymous and authenticated) to read active products';

COMMENT ON POLICY "Users read own favorites" ON user_favorites IS
  'Users can only read their own favorited products';

COMMENT ON FUNCTION get_user_favorite_product_ids IS
  'Returns array of product IDs favorited by a specific user';

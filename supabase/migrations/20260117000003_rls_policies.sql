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

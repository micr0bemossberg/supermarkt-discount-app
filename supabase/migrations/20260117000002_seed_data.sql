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

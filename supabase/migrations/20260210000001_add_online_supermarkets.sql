-- =====================================================
-- Add Online Supermarkets Migration
-- Adds is_online_only flag and seeds online-only supermarkets
-- =====================================================

-- Add is_online_only column to supermarkets table
ALTER TABLE supermarkets
  ADD COLUMN is_online_only BOOLEAN DEFAULT false;

-- Seed online-only supermarkets (is_active = false until scrapers are built)
INSERT INTO supermarkets (name, slug, website_url, primary_color, is_online_only, is_active) VALUES
  (
    'Picnic',
    'picnic',
    'https://www.picnic.app',
    '#E4262A',
    true,
    false
  ),
  (
    'Ochama',
    'ochama',
    'https://www.ochama.com',
    '#FF6600',
    true,
    false
  ),
  (
    'Joybuy',
    'joybuy',
    'https://www.joybuy.nl',
    '#C91F37',
    true,
    false
  ),
  (
    'Megafoodstunter',
    'megafoodstunter',
    'https://www.megafoodstunter.nl',
    '#2ECC40',
    true,
    false
  ),
  (
    'Butlon',
    'butlon',
    'https://www.butlon.nl',
    '#1A1A2E',
    true,
    false
  );

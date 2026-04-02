-- Add is_wholesale column to supermarkets
ALTER TABLE supermarkets ADD COLUMN IF NOT EXISTS is_wholesale BOOLEAN DEFAULT false;

-- Insert wholesale supermarkets (BTW deductible)
INSERT INTO supermarkets (name, slug, website_url, primary_color, is_online_only, is_wholesale, is_active)
VALUES
  ('Makro', 'makro', 'https://www.makro.nl', '#E31837', false, true, true),
  ('Sligro', 'sligro', 'https://www.sligro.nl', '#009B3A', false, true, true),
  ('Hanos', 'hanos', 'https://www.hanos.nl', '#1A1A6C', false, true, true)
ON CONFLICT (slug) DO UPDATE SET is_wholesale = true, is_active = true;

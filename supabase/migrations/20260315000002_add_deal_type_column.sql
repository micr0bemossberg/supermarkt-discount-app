-- Add deal_type column to products table for discount type classification
-- Values: korting, 1+1_gratis, 2+1_gratis, 2e_halve_prijs, x_voor_y,
--         weekend_actie, dag_actie, bonus, extra, stunt, combinatie_korting,
--         gratis_bijproduct, overig
ALTER TABLE products ADD COLUMN IF NOT EXISTS deal_type VARCHAR(50);

-- Index for filtering by deal type in the app
CREATE INDEX IF NOT EXISTS idx_products_deal_type ON products(deal_type) WHERE deal_type IS NOT NULL;

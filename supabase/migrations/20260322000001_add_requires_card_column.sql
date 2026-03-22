-- Add requires_card column for loyalty card deals (AH Bonus, Jumbo Extra's, etc.)
ALTER TABLE products ADD COLUMN IF NOT EXISTS requires_card BOOLEAN DEFAULT false;

-- =====================================================
-- Remove Ochama (rebranded to Joybuy) and deactivate non-working scrapers
-- Ochama was rebranded to Joybuy in Aug 2025 - they are the same company
-- =====================================================

-- Delete Ochama (duplicate of Joybuy)
DELETE FROM supermarkets WHERE slug = 'ochama';

-- Deactivate Joybuy (WAF blocks all scraping) and Picnic (requires account credentials)
UPDATE supermarkets SET is_active = false WHERE slug IN ('joybuy', 'picnic');

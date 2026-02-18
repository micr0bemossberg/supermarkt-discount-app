-- =====================================================
-- Add Hoogvliet and Action supermarkets
-- =====================================================

INSERT INTO supermarkets (name, slug, website_url, primary_color, is_online_only, is_active) VALUES
  (
    'Hoogvliet',
    'hoogvliet',
    'https://www.hoogvliet.com/aanbiedingen',
    '#E31937',
    false,
    true
  ),
  (
    'Action',
    'action',
    'https://www.action.com/nl-nl/weekactie/',
    '#0071CE',
    false,
    true
  );

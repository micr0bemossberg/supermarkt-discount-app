-- Add 5 categories defined in CategorySlug type but missing from seed data
INSERT INTO categories (name, slug, icon_name) VALUES
  ('Baby & Kind', 'baby-kind', 'baby-carriage'),
  ('Elektronica', 'elektronica', 'laptop'),
  ('Wonen & Keuken', 'wonen-keuken', 'silverware-fork-knife'),
  ('Sport & Vrije Tijd', 'sport-vrije-tijd', 'run'),
  ('Kleding & Mode', 'kleding-mode', 'tshirt-crew')
ON CONFLICT (slug) DO NOTHING;

/**
 * Category Type
 * Represents a product category for classification
 */

export interface Category {
  id: string;
  name: string;
  slug: string;
  icon_name: string | null;
  created_at: string;
}

export type CategorySlug =
  | 'vers-gebak'
  | 'vlees-vis-vega'
  | 'zuivel-eieren'
  | 'groente-fruit'
  | 'diepvries'
  | 'dranken'
  | 'bewaren'
  | 'ontbijt'
  | 'snoep-chips'
  | 'persoonlijke-verzorging'
  | 'huishouden'
  | 'baby-kind'
  | 'elektronica'
  | 'wonen-keuken'
  | 'sport-vrije-tijd'
  | 'kleding-mode'
  | 'overig';

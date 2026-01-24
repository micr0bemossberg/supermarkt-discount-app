/**
 * Supermarket Type
 * Represents a Dutch supermarket chain
 */

export interface Supermarket {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  website_url: string | null;
  primary_color: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export type SupermarketSlug = 'ah' | 'jumbo' | 'lidl' | 'aldi' | 'plus';

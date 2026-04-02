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
  is_online_only: boolean;
  is_wholesale: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export type SupermarketSlug =
  | 'ah' | 'jumbo' | 'aldi' | 'vomar' | 'dirk' | 'plus'
  | 'picnic' | 'joybuy' | 'megafoodstunter' | 'butlon'
  | 'hoogvliet' | 'action' | 'flink' | 'kruidvat' | 'dekamarkt'
  | 'makro' | 'sligro' | 'hanos';

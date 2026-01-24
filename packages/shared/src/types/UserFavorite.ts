/**
 * UserFavorite Type
 * Represents a user's favorited product
 */

import { Product } from './Product';

export interface UserFavorite {
  id: string;
  user_id: string;
  product_id: string;
  created_at: string;

  // Relation (when fetched with join)
  product?: Product;
}

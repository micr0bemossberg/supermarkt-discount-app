/**
 * Supermarkets Service
 * API layer for fetching supermarket data from Supabase
 */

import { supabase } from '../config/supabase';
import type { Supermarket, Category } from '@supermarkt-deals/shared';

/**
 * Fetch all active supermarkets
 */
export async function getSupermarkets(): Promise<Supermarket[]> {
  try {
    const { data, error } = await supabase
      .from('supermarkets')
      .select('*')
      .eq('is_active', true)
      .order('is_online_only')
      .order('name');

    if (error) {
      console.error('Error fetching supermarkets:', error);
      throw error;
    }

    return (data || []) as Supermarket[];
  } catch (error) {
    console.error('Failed to fetch supermarkets:', error);
    return [];
  }
}

/**
 * Fetch all categories
 */
export async function getCategories(): Promise<Category[]> {
  try {
    const { data, error } = await supabase
      .from('categories')
      .select('*')
      .order('name');

    if (error) {
      console.error('Error fetching categories:', error);
      throw error;
    }

    return (data || []) as Category[];
  } catch (error) {
    console.error('Failed to fetch categories:', error);
    return [];
  }
}

/**
 * Supabase Client Configuration
 * Uses service role key for full database access
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from root .env (try monorepo root, then CWD fallback)
dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });
dotenv.config(); // CWD fallback (for CI where env vars come from secrets)

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error(
    'Missing Supabase credentials. Please set SUPABASE_URL and SUPABASE_SERVICE_KEY in .env file'
  );
}

// Create Supabase client with service role key
// This bypasses RLS policies and allows full database access
export const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

// Test connection
export async function testConnection(): Promise<boolean> {
  try {
    const { error } = await supabase.from('supermarkets').select('count').limit(1);
    if (error) {
      console.error('Supabase connection test failed:', error.message);
      return false;
    }
    console.log('✓ Supabase connection successful');
    return true;
  } catch (error) {
    console.error('Supabase connection test error:', error);
    return false;
  }
}

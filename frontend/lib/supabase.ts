import { createClient } from "@supabase/supabase-js";

/**
 * Supabase with the anon key, for reading things everyone is allowed to see.
 *
 * Deliberately not the service role client: listings and their images have a public read
 * policy in schema.sql, so browsing needs no elevated key. Reading with the weakest key
 * that works also means the row level security policies get exercised for real rather
 * than bypassed and assumed correct.
 */
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export function getSupabase() {
  if (!url || !anonKey) {
    throw new Error(
      "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in frontend/.env.local"
    );
  }
  return createClient(url, anonKey, { auth: { persistSession: false } });
}

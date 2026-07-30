import "server-only";
import { createClient } from "@supabase/supabase-js";

/**
 * Supabase with the service role key. This key bypasses row level security and can
 * delete the whole database, so it must never reach the browser.
 *
 * The "server-only" import above is the guard: if any client component ever imports this
 * file, even indirectly, the build fails instead of quietly shipping the key to users.
 */
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export const LISTING_IMAGE_BUCKET = "listing-images";

export function getSupabaseAdmin() {
  if (!url || !serviceRoleKey) {
    throw new Error(
      "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in frontend/.env.local"
    );
  }
  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false },
  });
}

/**
 * Empties the Supabase side of the app: listings, their photos, reviews and chat.
 *
 * Meant to be run before pushing, so a branch is not carrying a pile of half-finished
 * test rentals. Rentals themselves are not touched because they are not here - they live
 * in the escrow contract, and restarting the local Hardhat node clears them.
 *
 * Refuses to run without --yes. This deletes everything in those tables, it cannot be
 * undone, and the difference between a test database and a real one is one wrong shell.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const LISTING_IMAGE_BUCKET = "listing-images";

// The API routes read these through Next, which loads .env.local by itself. A plain
// script does not, so parse the file rather than making the caller export them by hand.
function envFromFile() {
  const out: Record<string, string> = {};
  for (const line of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
    const match = /^([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line.trim());
    if (match) out[match[1]] = match[2].replace(/^["']|["']$/g, "");
  }
  return out;
}

async function main() {
  if (!process.argv.includes("--yes")) {
    console.log(
      "This deletes every listing, photo, review and message in Supabase.\n" +
        "Rentals are on the chain and are left alone.\n\n" +
        "Run it again with --yes if that is what you want."
    );
    process.exit(1);
  }

  const env = { ...envFromFile(), ...process.env };
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase credentials in frontend/.env.local");

  const supabase = createClient(url, key, { auth: { persistSession: false } });

  // Storage first. Dropping the rows first would lose the paths and leave the files
  // behind as orphans nobody can find.
  const { data: folders } = await supabase.storage.from(LISTING_IMAGE_BUCKET).list();
  let removed = 0;
  for (const folder of folders ?? []) {
    const { data: contents } = await supabase.storage.from(LISTING_IMAGE_BUCKET).list(folder.name);
    const paths = (contents ?? []).map((file) => `${folder.name}/${file.name}`);
    if (paths.length === 0) continue;
    const { error } = await supabase.storage.from(LISTING_IMAGE_BUCKET).remove(paths);
    if (error) throw error;
    removed += paths.length;
  }
  console.log(`photos       ${removed} removed`);

  // listing_images goes with the listing through its cascade, so it is not listed here.
  for (const table of ["reviews", "messages", "listings"]) {
    const { count, error } = await supabase
      .from(table)
      .delete({ count: "exact" })
      .not("id", "is", null);
    if (error) throw error;
    console.log(`${table.padEnd(12)} ${count ?? 0} removed`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

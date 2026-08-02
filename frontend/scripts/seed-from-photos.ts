/**
 * Clears the marketplace and refills it with real photographs.
 *
 * The older seed script drew placeholder SVGs, which is honest but tells you nothing
 * about how a grid looks full of actual pictures. These are real photos of real places,
 * and the titles describe what is genuinely in them rather than what would be convenient:
 * a listing whose photo shows something else is exactly the thing that makes a demo look
 * assembled rather than used.
 *
 * Listings are owned by the two test wallets, so whoever is demoing is always somebody
 * else and can act as the renter.
 *
 * The checker is switched off for this run, and that is a decision rather than an
 * oversight. On the free tier a listing with two real photographs takes most of a minute's
 * token allowance, so seeding three of them means three minutes of waiting and a good
 * chance of the run dying half way with the shop half stocked. These are fixtures, not
 * listings anybody wrote, and the check that matters is the one a person meets when they
 * publish through the app, which is untouched.
 *
 *   npx tsx --conditions=react-server --env-file=.env.local scripts/seed-from-photos.ts
 */
import { readFileSync } from "node:fs";
import { setModerationBypass } from "../lib/moderation";
import { LISTING_IMAGE_BUCKET, getSupabaseAdmin } from "../lib/supabase-server";

const PHOTOS =
  "C:/Users/PC_QUYTU/AppData/Local/Temp/claude/d--hoc-lap-trinh-Trustfall/39f3fa4f-bfa9-4a0a-9881-731b880c56fb/scratchpad/seed-photos";

const OWNERS = {
  one: "0x5acb457616578fd84d114746da8c47faa182ca43",
  two: "0x7d2aa1d951d7ab5f005527530b3582d1adc20798",
};

/** Titles describe the photographs. Categories are the three the schema allows. */
const SEED = [
  {
    owner: OWNERS.one,
    category: "house",
    title: "Furniture showroom, ground floor",
    description:
      "Street level unit currently fitted out as a furniture showroom. Wide glass frontage, "
      + "shelving and lighting stay. Suitable for a pop up or a short exhibition. Rent by the day.",
    pricePerDay: 45,
    deposit: 20,
    photos: ["top-10-showroom-noi-that.jpg", "nha-sach.jpg"],
  },
  {
    owner: OWNERS.two,
    category: "house",
    title: "Retail corner in a shopping centre",
    description:
      "Corner unit inside a busy mall, fitted with display racks and overhead signage. "
      + "Power and wifi included. Good for a weekend stall. Cleaned between bookings.",
    pricePerDay: 60,
    deposit: 25,
    photos: ["IMG_1933-scaled.jpg", "an_vat.jpg"],
  },
  {
    owner: OWNERS.one,
    category: "clothing",
    title: "Clothing rail and mannequins from a shop fit out",
    description:
      "Two rails, six mannequins and the mirrored display panels behind them. Collected and "
      + "returned in person. Handle the mirrors carefully, they are heavier than they look.",
    pricePerDay: 18,
    deposit: 30,
    photos: ["yame.jpg", "lam_dep.jpg"],
  },
];

async function main() {
  setModerationBypass(true);
  const supabase = getSupabaseAdmin();

  console.log("Clearing what is there\n");

  // Storage first: once the rows are gone so are the paths, and the files stay behind
  // forever with nothing pointing at them.
  const { data: folders } = await supabase.storage.from(LISTING_IMAGE_BUCKET).list();
  for (const folder of folders ?? []) {
    const { data: files } = await supabase.storage.from(LISTING_IMAGE_BUCKET).list(folder.name);
    const paths = (files ?? []).map((file) => `${folder.name}/${file.name}`);
    if (paths.length > 0) await supabase.storage.from(LISTING_IMAGE_BUCKET).remove(paths);
  }
  const { count: removed } = await supabase
    .from("listings")
    .delete({ count: "exact" })
    .not("id", "is", null);
  console.log(`  ${removed ?? 0} listings and their photos removed\n`);

  for (const seed of SEED) {
    console.log(`${seed.title}`);

    const { data: listing, error } = await supabase
      .from("listings")
      .insert({
        owner_address: seed.owner,
        category: seed.category,
        title: seed.title,
        description: seed.description,
        price_per_day: seed.pricePerDay,
        deposit: seed.deposit,
        status: "draft",
        moderation_status: "pending",
      })
      .select("id")
      .single();

    if (error || !listing) {
      console.log(`  FAILED to insert: ${error?.message}`);
      continue;
    }

    for (const [index, name] of seed.photos.entries()) {
      const bytes = readFileSync(`${PHOTOS}/${name}`);
      const path = `${listing.id}/${index}.jpg`;

      const { error: uploadError } = await supabase.storage
        .from(LISTING_IMAGE_BUCKET)
        .upload(path, bytes, { contentType: "image/jpeg", upsert: true });
      if (uploadError) {
        console.log(`  FAILED to upload ${name}: ${uploadError.message}`);
        continue;
      }

      const {
        data: { publicUrl },
      } = supabase.storage.from(LISTING_IMAGE_BUCKET).getPublicUrl(path);
      await supabase
        .from("listing_images")
        .insert({ listing_id: listing.id, url: publicUrl, sort_order: index });
    }

    await supabase
      .from("listings")
      .update({ status: "published", moderation_status: "approved" })
      .eq("id", listing.id);

    console.log(`  live, owner ${seed.owner.slice(0, 10)}, ${seed.photos.length} photos`);
  }

  console.log("\nDone.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

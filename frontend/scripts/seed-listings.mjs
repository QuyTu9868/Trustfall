/**
 * Fills the database with listings so the browse grid and the category filter have
 * something to show.
 *
 * The photos are generated SVGs, not stock photography. A random stock photo is a real
 * picture of the wrong thing, and a motorbike listing showing a mountain range looks
 * worse than an honest placeholder. These carry the item name, follow the same palette as
 * the app, weigh a few KB and need no network at demo time.
 *
 * Swap in real photographs before the public demo. A grid of drawings does not tell you
 * how the grid looks full of photographs.
 *
 *   node scripts/seed-listings.mjs           add the listings
 *   node scripts/seed-listings.mjs --reset   remove them again
 *
 * Seeded rows are owned by the Hardhat test accounts, which is both how they are found
 * again for cleanup and what makes them rentable: they belong to somebody other than you,
 * so you can act as the renter.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split(/\r?\n/)
    .filter((line) => line && !line.startsWith("#") && line.includes("="))
    .map((line) => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1).trim()])
);

if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing Supabase config in frontend/.env.local");
  process.exit(1);
}

const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const BUCKET = "listing-images";

// Hardhat accounts 1 to 3, lowercase because the wallet_address domain requires it.
const OWNERS = [
  "0x70997970c51812dc3a010c7d01b50e0d17dc79c8",
  "0x3c44cdddb6a900fa2b585dd299e03d12fa4293bc",
  "0x90f79bf6eb2c4f870365e785982e1f101e93b906",
];

const LISTINGS = [
  {
    category: "vehicle",
    title: "Honda Wave 110, 2019",
    description:
      "Automatic clutch, starts first kick. Serviced in June, new rear tyre. Comes with two helmets and a rain poncho. Pickup in District 3.",
    price_per_day: 6,
    deposit: 30,
  },
  {
    category: "vehicle",
    title: "Yamaha Sirius, 2021",
    description:
      "Low mileage, 12,400km. Front disc brake, phone mount fitted. Good on fuel, about 50km per litre in city traffic.",
    price_per_day: 7,
    deposit: 30,
  },
  {
    category: "vehicle",
    title: "Giant Escape 3 city bike",
    description:
      "Aluminium frame, size M, fits riders 165 to 178cm. Rack and lights included. Recently tuned, gears shift cleanly.",
    price_per_day: 4,
    deposit: 20,
  },
  {
    category: "house",
    title: "Studio near Ben Thanh market",
    description:
      "28 square metres, air conditioning, fast wifi, small kitchen. Second floor, no lift. Quiet street, five minutes walk to the market.",
    price_per_day: 22,
    deposit: 60,
  },
  {
    category: "house",
    title: "Two bedroom flat, Thao Dien",
    description:
      "Balcony over the river, washing machine, parking for one motorbike. Sleeps four. Building has a pool open until 9pm.",
    price_per_day: 38,
    deposit: 80,
  },
  {
    category: "house",
    title: "Attic room with desk, Da Kao",
    description:
      "Single room with a proper desk and a chair meant for working. Shared kitchen downstairs. Suits somebody staying a couple of weeks.",
    price_per_day: 14,
    deposit: 40,
  },
  {
    category: "clothing",
    title: "Black tuxedo, size 48",
    description:
      "Two piece, single breasted, satin lapels. Dry cleaned after every rental. Bow tie and cummerbund included. Trousers unhemmed.",
    price_per_day: 12,
    deposit: 50,
  },
  {
    category: "clothing",
    title: "Ao dai, embroidered, size S",
    description:
      "Deep red silk with hand embroidery at the collar and hem. Worn twice. Includes matching trousers and a garment bag.",
    price_per_day: 9,
    deposit: 40,
  },
  {
    category: "clothing",
    title: "Wedding gown, A line, size M",
    description:
      "Ivory, lace bodice, small train. Professionally cleaned and steamed before each rental. Veil available on request.",
    price_per_day: 25,
    deposit: 90,
  },
];

// One pastel per category, the same pairs the app uses for status badges.
const PALETTE = {
  vehicle: { bg: "#e1f3fe", ink: "#1f6c9f" },
  house: { bg: "#edf3ec", ink: "#346538" },
  clothing: { bg: "#fbf3db", ink: "#956400" },
};

/** Escapes the five characters that would otherwise break the SVG markup. */
function escapeXml(text) {
  return text.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c]
  );
}

function placeholderSvg({ title, category, index }) {
  const { bg, ink } = PALETTE[category];
  const label = escapeXml(title);
  // Offset circle, flat fill, no gradient: the same restraint as the rest of the app.
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="900" viewBox="0 0 1200 900" role="img" aria-label="${label}">
  <rect width="1200" height="900" fill="${bg}"/>
  <circle cx="${index === 0 ? 940 : 260}" cy="${index === 0 ? 220 : 680}" r="190" fill="#ffffff" opacity="0.55"/>
  <text x="80" y="470" font-family="Georgia, 'Times New Roman', serif" font-size="66" fill="${ink}">${label}</text>
  <text x="80" y="540" font-family="ui-monospace, monospace" font-size="30" fill="${ink}" opacity="0.7">Placeholder ${index + 1} of 2</text>
</svg>`;
}

async function reset() {
  const { data: rows, error } = await db
    .from("listings")
    .select("id")
    .in("owner_address", OWNERS);
  if (error) throw new Error(error.message);

  if (rows.length === 0) {
    console.log("Nothing seeded to remove.");
    return;
  }
  for (const { id } of rows) {
    const { data: files } = await db.storage.from(BUCKET).list(id);
    if (files?.length) {
      await db.storage.from(BUCKET).remove(files.map((f) => `${id}/${f.name}`));
    }
  }
  // listing_images goes with it: the foreign key cascades on delete.
  const { error: delError } = await db.from("listings").delete().in("id", rows.map((r) => r.id));
  if (delError) throw new Error(delError.message);
  console.log(`Removed ${rows.length} seeded listings and their images.`);
}

async function seed() {
  const { data: existing } = await db.from("listings").select("id").in("owner_address", OWNERS);
  if (existing?.length) {
    console.log(`${existing.length} seeded listings already there. Run with --reset first.`);
    return;
  }

  for (const [position, item] of LISTINGS.entries()) {
    const owner = OWNERS[position % OWNERS.length];

    const { data: listing, error } = await db
      .from("listings")
      .insert({ ...item, owner_address: owner, status: "published", moderation_status: "pending" })
      .select("id")
      .single();
    if (error) throw new Error(`${item.title}: ${error.message}`);

    for (let index = 0; index < 2; index++) {
      const path = `${listing.id}/${index}.svg`;
      const svg = placeholderSvg({ title: item.title, category: item.category, index });

      const { error: upError } = await db.storage
        .from(BUCKET)
        .upload(path, new Blob([svg], { type: "image/svg+xml" }), {
          contentType: "image/svg+xml",
          upsert: true,
        });
      if (upError) throw new Error(`${item.title} image ${index}: ${upError.message}`);

      const {
        data: { publicUrl },
      } = db.storage.from(BUCKET).getPublicUrl(path);

      // uploaded_at is left to the database clock, exactly as the API route does.
      const { error: imgError } = await db
        .from("listing_images")
        .insert({ listing_id: listing.id, url: publicUrl, sort_order: index });
      if (imgError) throw new Error(`${item.title} image row ${index}: ${imgError.message}`);
    }
    console.log(`  ${item.category.padEnd(9)} ${item.title}`);
  }
  console.log(`\nSeeded ${LISTINGS.length} listings across ${OWNERS.length} owners.`);
}

const command = process.argv.includes("--reset") ? reset : seed;
command().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});

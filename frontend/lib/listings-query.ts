import { CATEGORIES, type Category } from "./listing";
import { rentedOutListingIds } from "./rental-server";
import { getSupabase } from "./supabase";

/**
 * Reads for the browse grid and the detail page.
 *
 * Kept out of the page files so the shape of a listing is described once. Both pages and
 * the price hint read from here.
 */
export const PAGE_SIZE = 6;

export type ListingCard = {
  id: string;
  category: Category;
  title: string;
  price_per_day: string;
  deposit: string;
  listing_images: { url: string; sort_order: number }[];
};

export type ListingDetail = ListingCard & {
  description: string;
  /** Roughly where it is collected. Null on listings published before this existed. */
  pickup_area: string | null;
  /** The exact pickup spot, chosen on a map. Null on a listing where the owner skipped it. */
  lat: number | null;
  lng: number | null;
  owner_address: string;
  created_at: string;
  moderation_status: string;
};

export function parseCategory(value: unknown): Category | null {
  return CATEGORIES.includes(value as Category) ? (value as Category) : null;
}

export async function fetchListings({
  category,
  page,
}: {
  category: Category | null;
  page: number;
}) {
  const supabase = getSupabase();
  const from = (page - 1) * PAGE_SIZE;

  // Pagination rather than infinite scroll, per UI-REFERENCE.md section 5. Also asks for
  // an exact count so the page numbers are real rather than guessed from what came back.
  let query = supabase
    .from("listings")
    .select("id, category, title, price_per_day, deposit, listing_images(url, sort_order)", {
      count: "exact",
    })
    .eq("status", "published")
    .eq("moderation_status", "approved")
    .order("created_at", { ascending: false })
    .range(from, from + PAGE_SIZE - 1);

  if (category) query = query.eq("category", category);

  // Excluded in the query rather than filtered out of the results. Dropping rows after
  // the fact would leave a page of six showing four, and the exact count behind the page
  // numbers would be counting things nobody can see.
  const rentedOut = await rentedOutListingIds();
  if (rentedOut.size > 0) query = query.not("id", "in", `(${[...rentedOut].join(",")})`);

  const { data, error, count } = await query;
  if (error) throw new Error(error.message);

  const listings = (data ?? []).map((row) => ({
    ...row,
    listing_images: [...row.listing_images].sort((a, b) => a.sort_order - b.sort_order),
  })) as ListingCard[];

  return { listings, total: count ?? 0, pageCount: Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE)) };
}

export async function fetchListing(id: string): Promise<ListingDetail | null> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("listings")
    .select(
      "id, category, title, description, pickup_area, lat, lng, price_per_day, deposit, owner_address, created_at, moderation_status, listing_images(url, sort_order)"
    )
    .eq("id", id)
    .eq("status", "published")
    .eq("moderation_status", "approved")
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return null;

  return {
    ...data,
    listing_images: [...data.listing_images].sort((a, b) => a.sort_order - b.sort_order),
  } as ListingDetail;
}

/** Counts per category, for the filter row to show how much is behind each button. */
export async function fetchCategoryCounts() {
  const supabase = getSupabase();

  // Same exclusion as the grid. A filter button reading "Vehicles 4" that opens onto three
  // cards is a worse bug than the one it came from, because now two screens disagree.
  const rentedOut = await rentedOutListingIds();
  let query = supabase.from("listings").select("category").eq("status", "published")
    .eq("moderation_status", "approved");
  if (rentedOut.size > 0) query = query.not("id", "in", `(${[...rentedOut].join(",")})`);

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const counts: Record<string, number> = {};
  for (const row of data ?? []) counts[row.category] = (counts[row.category] ?? 0) + 1;
  return { counts, total: data?.length ?? 0 };
}

/**
 * What similar items actually charge, for the owner to compare against.
 *
 * Taken from real listings, never from a language model. CLAUDE.md section 9 is blunt
 * about why: asked for a price, a model invents a plausible number and is confidently
 * wrong. Below three listings there is nothing worth saying, because a median of two
 * samples is noise dressed up as advice.
 */
export async function fetchPriceHint(category: Category) {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("listings")
    .select("price_per_day")
    .eq("category", category)
    .eq("status", "published")
    .eq("moderation_status", "approved");
  if (error) throw new Error(error.message);

  const prices = (data ?? []).map((row) => Number(row.price_per_day)).sort((a, b) => a - b);
  if (prices.length < 3) return null;

  // Middle half of the range: the typical asking price, without the outliers at each end
  // dragging the numbers somewhere nobody actually charges.
  const low = prices[Math.floor(prices.length * 0.25)];
  const high = prices[Math.floor(prices.length * 0.75)];
  return { count: prices.length, low, high };
}

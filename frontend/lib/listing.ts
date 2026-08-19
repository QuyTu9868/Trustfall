/**
 * Listing rules, in one place because both sides need them and they have to agree.
 *
 * The browser checks them so the user gets a useful message next to the field, and the
 * API route checks them again because a browser check is a courtesy, not a defence. Both
 * read from here, and all of it mirrors the constraints in services/supabase/schema.sql:
 * disagree with those and Postgres answers with an opaque 500.
 */

export const CATEGORIES = ["house", "vehicle", "clothing"] as const;
export type Category = (typeof CATEGORIES)[number];

export const CATEGORY_LABELS: Record<Category, string> = {
  house: "Home",
  vehicle: "Vehicle",
  clothing: "Clothing",
};

export const IMAGES_PER_LISTING = 2;
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

export const MAX_TITLE_LENGTH = 80;
export const MAX_DESCRIPTION_LENGTH = 2000;

/**
 * Short on purpose. This is a neighbourhood, not an address.
 *
 * A listing is public before anybody books it, so the exact spot where somebody parks
 * their car has no business being on it. A hundred characters holds "District 1, near Ben
 * Thanh market" and does not hold a street number and a floor.
 */
export const MAX_PICKUP_AREA_LENGTH = 100;

export type ListingDraft = {
  category: Category | null;
  title: string;
  description: string;
  pickupArea: string;
  pricePerDay: string;
  deposit: string;
};

export const emptyDraft: ListingDraft = {
  category: null,
  title: "",
  description: "",
  pickupArea: "",
  pricePerDay: "",
  deposit: "",
};

/** Field name to message. Empty object means the draft is good. */
export type FieldErrors = Partial<Record<keyof ListingDraft | "images", string>>;

export function validateDraft(draft: ListingDraft): FieldErrors {
  const errors: FieldErrors = {};

  if (!draft.category) {
    errors.category = "Pick a category.";
  }
  if (!draft.title.trim()) {
    errors.title = "A title is required.";
  } else if (draft.title.trim().length > MAX_TITLE_LENGTH) {
    errors.title = `Keep it under ${MAX_TITLE_LENGTH} characters.`;
  }
  if (!draft.description.trim()) {
    errors.description = "Say what it is and what condition it is in.";
  } else if (draft.description.trim().length > MAX_DESCRIPTION_LENGTH) {
    errors.description = `Keep it under ${MAX_DESCRIPTION_LENGTH} characters.`;
  }
  if (!draft.pickupArea.trim()) {
    errors.pickupArea = "Say roughly where it is collected from.";
  } else if (draft.pickupArea.trim().length > MAX_PICKUP_AREA_LENGTH) {
    errors.pickupArea = `An area, not an address. Under ${MAX_PICKUP_AREA_LENGTH} characters.`;
  }

  const price = Number(draft.pricePerDay);
  if (!draft.pricePerDay.trim()) {
    errors.pricePerDay = "Set a daily price.";
  } else if (!Number.isFinite(price) || price <= 0) {
    errors.pricePerDay = "Must be more than 0.";
  }

  const deposit = Number(draft.deposit);
  if (!draft.deposit.trim()) {
    errors.deposit = "Set a deposit, or 0 for none.";
  } else if (!Number.isFinite(deposit) || deposit < 0) {
    errors.deposit = "Cannot be negative.";
  }

  return errors;
}

export function validateImages(files: File[]): string | null {
  if (files.length !== IMAGES_PER_LISTING) {
    return `Pick exactly ${IMAGES_PER_LISTING} photos.`;
  }
  for (const file of files) {
    if (!ALLOWED_IMAGE_TYPES.includes(file.type as (typeof ALLOWED_IMAGE_TYPES)[number])) {
      return `${file.name} is not a JPG, PNG or WebP.`;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      return `${file.name} is over ${MAX_IMAGE_BYTES / 1024 / 1024}MB.`;
    }
  }
  return null;
}

/** USDC has 6 decimals, so the database column is numeric(20, 6). */
export function formatUsdc(value: string | number) {
  const amount = Number(value);
  return Number.isFinite(amount) ? amount.toFixed(2) : "0.00";
}

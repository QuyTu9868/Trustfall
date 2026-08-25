import { NextResponse, after } from "next/server";
import { errorResponse } from "@/lib/api";
import {
  ALLOWED_IMAGE_TYPES,
  CATEGORIES,
  IMAGES_PER_LISTING,
  MAX_DESCRIPTION_LENGTH,
  MAX_IMAGE_BYTES,
  MAX_PICKUP_AREA_LENGTH,
  MAX_TITLE_LENGTH,
  type Category,
} from "@/lib/listing";
import { ModerationUnavailable, moderateListing, toDataUrls } from "@/lib/moderation";
import { notifyListingCheckFailed } from "@/lib/notify";
import {
  AuthError,
  readIdentityToken,
  walletFromIdentityToken,
} from "@/lib/privy-server";
import { LISTING_IMAGE_BUCKET, getSupabaseAdmin } from "@/lib/supabase-server";

/**
 * Creates a listing: two image uploads plus one row, from one request.
 *
 * Everything the browser sent is re-checked here. The browser already validated the same
 * rules for the sake of useful messages next to the fields, but that check is a courtesy
 * to honest users, not a defence against a crafted request.
 *
 * The owner address is never read from the body. It comes from the verified Privy
 * identity token, otherwise anyone could publish a listing under someone else's wallet.
 */
export async function POST(request: Request) {
  try {
    return await createListing(request);
  } catch (error) {
    if (error instanceof AuthError) return errorResponse(error, 401);
    // The checker being down is not the listing's fault, and 503 is what tells the owner
    // to wait rather than to rewrite their description.
    if (error instanceof ModerationUnavailable) return errorResponse(error, 503);
    // Missing configuration, an unreachable database, a rejected upload: all land here
    // with a message, rather than as a bare 500 with an empty body.
    return errorResponse(error);
  }
}

async function createListing(request: Request) {
  const owner = await walletFromIdentityToken(await readIdentityToken(request));

  const form = await request.formData();
  const category = String(form.get("category") ?? "");
  const title = String(form.get("title") ?? "").trim();
  const description = String(form.get("description") ?? "").trim();
  const pickupArea = String(form.get("pickupArea") ?? "").trim();
  const rawLat = form.get("lat");
  const rawLng = form.get("lng");
  const lat = rawLat !== null && rawLat !== "" ? Number(rawLat) : null;
  const lng = rawLng !== null && rawLng !== "" ? Number(rawLng) : null;
  const pricePerDay = Number(form.get("pricePerDay"));
  const deposit = Number(form.get("deposit"));
  const images = form.getAll("images").filter((v): v is File => v instanceof File);

  const problem = firstProblem({
    category,
    title,
    description,
    pickupArea,
    lat,
    lng,
    pricePerDay,
    deposit,
    images,
  });
  if (problem) return NextResponse.json({ error: problem }, { status: 400 });

  const supabase = getSupabaseAdmin();

  // Saved before it is checked, and this order is the whole point of the change. The check
  // can take the best part of a minute once the free tier starts rationing, and anybody
  // who reloaded during that wait used to lose a description and two photographs with no
  // way to get them back.
  //
  // Draft and pending, so nothing half checked is ever browsable. The verdict decides
  // whether it becomes published, and it arrives by way of the bell because the page that
  // asked for it may well be gone by then.
  const { data: listing, error: insertError } = await supabase
    .from("listings")
    .insert({
      owner_address: owner,
      category,
      title,
      description,
      pickup_area: pickupArea,
      lat,
      lng,
      price_per_day: pricePerDay,
      deposit,
      status: "draft",
      moderation_status: "pending",
    })
    .select("id")
    .single();

  if (insertError || !listing) {
    return NextResponse.json(
      { error: insertError?.message ?? "Could not save the listing." },
      { status: 500 }
    );
  }

  const uploaded: string[] = [];
  try {
    for (const [index, file] of images.entries()) {
      const extension = file.type.split("/")[1].replace("jpeg", "jpg");
      const path = `${listing.id}/${index}.${extension}`;

      const { error: uploadError } = await supabase.storage
        .from(LISTING_IMAGE_BUCKET)
        .upload(path, file, { contentType: file.type, upsert: true });
      if (uploadError) throw new Error(uploadError.message);
      uploaded.push(path);

      const {
        data: { publicUrl },
      } = supabase.storage.from(LISTING_IMAGE_BUCKET).getPublicUrl(path);

      // uploaded_at is left out on purpose. The column defaults to the database clock,
      // which is the whole point: EXIF timestamps can be rewritten in seconds, and this
      // timestamp is evidence the dispute agent uses to split a deposit.
      const { error: imageError } = await supabase.from("listing_images").insert({
        listing_id: listing.id,
        url: publicUrl,
        sort_order: index,
      });
      if (imageError) throw new Error(imageError.message);
    }
  } catch (error) {
    // A listing with one photo is worse than no listing, so undo the whole thing.
    await supabase.storage.from(LISTING_IMAGE_BUCKET).remove(uploaded);
    await supabase.from("listings").delete().eq("id", listing.id);
    return errorResponse(error);
  }

  // The gate runs after the answer goes out, not before it.
  //
  // It used to be awaited here, and a measured check took sixty four seconds while Google
  // was busy. Sixty four seconds of a spinner on a form somebody has already filled in is
  // how a listing gets abandoned halfway, and refreshing during it used to lose the
  // description and both photographs.
  //
  // Nothing is weakened by moving it. The listing is written as pending and pending is not
  // published: it does not appear in the browse grid and cannot be rented. The check still
  // decides, still runs on the server, still cannot be skipped by the browser declining to
  // call it. The only thing that changed is who is waiting.
  const photos = await toDataUrls(images);
  after(async () => {
    try {
      await moderateListing({
        title,
        description,
        pickupArea,
        images: photos,
        // The row exists by now, so the check is recorded against it. The preview call the
        // browser makes at step 2 has no listing yet and is deliberately not logged: it is
        // a rehearsal, and a log full of rehearsals hides the decisions that counted.
        listingId: listing.id,
      });
      // Nothing to apply here any more. Passing listingId sends the decision out through
      // the gateway, and the route on the other side is what updates the row, records the
      // check and rings the bell. Doing it here as well would apply the same verdict twice
      // and would put the half a policy is meant to guard back inside this process.
    } catch (error) {
      // Nobody is waiting on this response any more, so a failure that goes only to the
      // console is a listing stuck at pending with its owner never told why. The row stays
      // pending on purpose, which is recoverable from their own page, and the bell says so.
      console.error("The listing check did not complete:", error);
      await notifyListingCheckFailed(owner, listing.id, title);
    }
  });

  // 202: taken, not yet decided. The owner is sent on their way and the bell brings the
  // verdict, which migration 005 was written for.
  return NextResponse.json({ id: listing.id, pending: true }, { status: 202 });
}


type Incoming = {
  category: string;
  title: string;
  description: string;
  pickupArea: string;
  lat: number | null;
  lng: number | null;
  pricePerDay: number;
  deposit: number;
  images: File[];
};

/** Same rules as lib/listing.ts, and the same rules as the database constraints. */
export function firstProblem(input: Incoming): string | null {
  return firstTextProblem(input) ?? firstPhotoProblem(input.images);
}

/**
 * Everything about a listing except its photographs.
 *
 * Split out because editing a rejected listing changes only the words: the stored photos
 * are reused as they are. The alternative was handing the full validator an array of fake
 * files to satisfy a count it did not need to check, which typechecks and then throws.
 */
export function firstTextProblem(input: Omit<Incoming, "images">): string | null {
  if (!CATEGORIES.includes(input.category as Category)) return "Unknown category.";
  if (!input.title) return "A title is required.";
  if (input.title.length > MAX_TITLE_LENGTH) return "Title is too long.";
  if (!input.description) return "A description is required.";
  if (input.description.length > MAX_DESCRIPTION_LENGTH) {
    return "Description is too long.";
  }
  // Required. Somebody has to physically go and collect the thing, and a listing that does
  // not say roughly where it is cannot be acted on.
  if (!input.pickupArea) return "Say roughly where it is collected from.";
  if (input.pickupArea.length > MAX_PICKUP_AREA_LENGTH) {
    return "That is too long for an area. A district or a neighbourhood is enough.";
  }
  // Both or neither. One without the other is a pin that cannot be placed on a map.
  if ((input.lat === null) !== (input.lng === null)) {
    return "That pin did not come through right. Click the map again.";
  }
  if (input.lat !== null && (!Number.isFinite(input.lat) || input.lat < -90 || input.lat > 90)) {
    return "That is not a real latitude.";
  }
  if (input.lng !== null && (!Number.isFinite(input.lng) || input.lng < -180 || input.lng > 180)) {
    return "That is not a real longitude.";
  }
  if (!Number.isFinite(input.pricePerDay) || input.pricePerDay <= 0) {
    return "Daily price must be more than 0.";
  }
  if (!Number.isFinite(input.deposit) || input.deposit < 0) {
    return "Deposit cannot be negative.";
  }
  return null;
}

function firstPhotoProblem(images: File[]): string | null {
  if (images.length !== IMAGES_PER_LISTING) {
    return `Exactly ${IMAGES_PER_LISTING} photos are required.`;
  }
  for (const file of images) {
    if (!ALLOWED_IMAGE_TYPES.includes(file.type as (typeof ALLOWED_IMAGE_TYPES)[number])) {
      return "Photos must be JPG, PNG or WebP.";
    }
    if (file.size > MAX_IMAGE_BYTES) return "A photo is over the size limit.";
  }
  return null;
}

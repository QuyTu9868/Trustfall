import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/api";
import {
  ALLOWED_IMAGE_TYPES,
  CATEGORIES,
  IMAGES_PER_LISTING,
  MAX_DESCRIPTION_LENGTH,
  MAX_IMAGE_BYTES,
  MAX_TITLE_LENGTH,
  type Category,
} from "@/lib/listing";
import { ModerationUnavailable, moderateListing, toDataUrls } from "@/lib/moderation";
import { notifyListingVerdict } from "@/lib/notify";
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
  const pricePerDay = Number(form.get("pricePerDay"));
  const deposit = Number(form.get("deposit"));
  const images = form.getAll("images").filter((v): v is File => v instanceof File);

  const problem = firstProblem({
    category,
    title,
    description,
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

  // Now the gate. The browser ran this too, at step 2, so the owner saw it coming, but
  // that call can simply not be made, and this is the one that decides.
  //
  // Fails closed on purpose. A moderation step that waves listings through whenever the
  // model is unreachable is not a moderation step, it is a delay. A listing left at
  // pending is recoverable from the owner's own page; one waved through is not.
  const verdict = await moderateListing({
    title,
    description,
    images: await toDataUrls(images),
  });

  await applyVerdict(listing.id, owner, title, verdict);

  return NextResponse.json(
    { id: listing.id, decision: verdict.decision, reasons: verdict.reasons },
    { status: verdict.decision === "approve" ? 201 : 422 }
  );
}

/**
 * Records what the checker decided and tells the owner.
 *
 * Shared with the resubmit route so a listing checked twice cannot end up following two
 * slightly different rules about what approved means.
 */
export async function applyVerdict(
  listingId: string,
  owner: string,
  title: string,
  verdict: { decision: "approve" | "reject"; reasons: string[] }
) {
  const approved = verdict.decision === "approve";

  await getSupabaseAdmin()
    .from("listings")
    .update({
      status: approved ? "published" : "draft",
      moderation_status: approved ? "approved" : "rejected",
      // Kept even when approved, cleared to null, so a listing that was rejected and then
      // fixed does not carry the old complaint around forever.
      moderation_reason: approved ? null : verdict.reasons.join(" "),
    })
    .eq("id", listingId);

  await notifyListingVerdict(owner, listingId, title, verdict);
}

type Incoming = {
  category: string;
  title: string;
  description: string;
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

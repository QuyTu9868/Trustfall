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

  // The row first, so an image can never be orphaned without a listing pointing at it.
  const { data: listing, error: insertError } = await supabase
    .from("listings")
    .insert({
      owner_address: owner,
      category,
      title,
      description,
      price_per_day: pricePerDay,
      deposit,
      status: "published",
      // Moderation arrives in checkpoint 9. Until then every listing sits at pending,
      // which is honest: nothing has looked at it yet.
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

  return NextResponse.json({ id: listing.id }, { status: 201 });
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
function firstProblem(input: Incoming): string | null {
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
  if (input.images.length !== IMAGES_PER_LISTING) {
    return `Exactly ${IMAGES_PER_LISTING} photos are required.`;
  }
  for (const file of input.images) {
    if (!ALLOWED_IMAGE_TYPES.includes(file.type as (typeof ALLOWED_IMAGE_TYPES)[number])) {
      return "Photos must be JPG, PNG or WebP.";
    }
    if (file.size > MAX_IMAGE_BYTES) return "A photo is over the size limit.";
  }
  return null;
}

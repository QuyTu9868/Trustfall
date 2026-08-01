import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/api";
import { AuthError, readIdentityToken, walletFromIdentityToken } from "@/lib/privy-server";
import { RentalError, readRentalAsParty } from "@/lib/rental-server";
import { CHAT_IMAGE_BUCKET, getSupabaseAdmin } from "@/lib/supabase-server";

const MAX_LENGTH = 2000;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];

/** How long a signed photo link stays good. Long enough to read a thread, not forever. */
const LINK_SECONDS = 60 * 60;

/**
 * The thread for one rental.
 *
 * Private to the two people in it. The messages table has no anon read policy at all, so
 * the only way in is through here, and here reads the rental off the chain to find out
 * who the two people actually are. Signing in as a third party gets a 403 rather than
 * somebody else's conversation.
 */
export async function GET(request: Request) {
  try {
    const caller = await walletFromIdentityToken(await readIdentityToken(request));
    const rentalId = new URL(request.url).searchParams.get("rentalId");
    const { rental } = await readRentalAsParty(rentalId, caller);
    const supabase = getSupabaseAdmin();

    const { data, error } = await supabase
      .from("messages")
      .select("id, sender_address, body, image_path, created_at")
      .eq("onchain_rental_id", Number(rental.id))
      .order("created_at");

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Photos live in a private bucket, so a link is minted here for the person who just
    // proved they belong in this conversation, and it expires. A public bucket would mean
    // anyone who ever saw a URL keeps the photo for good.
    const paths = (data ?? []).map((m) => m.image_path).filter((p): p is string => Boolean(p));
    const links = new Map<string, string>();
    if (paths.length > 0) {
      const { data: signed } = await supabase.storage
        .from(CHAT_IMAGE_BUCKET)
        .createSignedUrls(paths, LINK_SECONDS);
      for (const entry of signed ?? []) {
        if (entry.path && entry.signedUrl) links.set(entry.path, entry.signedUrl);
      }
    }

    const messages = (data ?? []).map(({ image_path, ...rest }) => ({
      ...rest,
      image_url: image_path ? (links.get(image_path) ?? null) : null,
    }));

    // Having the thread open is what counts as having read it. Marking it here rather
    // than in a separate call means the badge cannot stay lit while the messages it
    // refers to are on screen.
    await supabase.from("thread_reads").upsert(
      {
        address: caller,
        onchain_rental_id: Number(rental.id),
        last_read_at: new Date().toISOString(),
      },
      { onConflict: "address,onchain_rental_id" }
    );

    return NextResponse.json({ messages });
  } catch (error) {
    if (error instanceof AuthError) return errorResponse(error, 401);
    if (error instanceof RentalError) return errorResponse(error, error.status);
    return errorResponse(error);
  }
}

/**
 * Sends a message: a line of text, a photo, or a photo with a line under it.
 *
 * Multipart rather than JSON so the photo rides along in the same request. Nothing is
 * stored until the caller has been shown to be one of the two people in the rental, so an
 * upload cannot be used to park files in the bucket.
 */
export async function POST(request: Request) {
  try {
    const caller = await walletFromIdentityToken(await readIdentityToken(request));
    const form = await request.formData();

    const rentalId = form.get("rentalId");
    const text = String(form.get("body") ?? "").trim();
    const image = form.get("image");
    const hasImage = image instanceof File && image.size > 0;

    if (!text && !hasImage) {
      return NextResponse.json({ error: "Nothing to send." }, { status: 400 });
    }
    if (text.length > MAX_LENGTH) {
      return NextResponse.json({ error: "That message is too long." }, { status: 400 });
    }
    if (hasImage) {
      if (!IMAGE_TYPES.includes(image.type)) {
        return NextResponse.json({ error: "Photos must be JPG, PNG or WebP." }, { status: 400 });
      }
      if (image.size > MAX_IMAGE_BYTES) {
        return NextResponse.json({ error: "That photo is over 5MB." }, { status: 400 });
      }
    }

    const { rental, counterparty } = await readRentalAsParty(rentalId, caller);
    const supabase = getSupabaseAdmin();

    let path: string | null = null;
    if (hasImage) {
      const extension = image.type.split("/")[1].replace("jpeg", "jpg");
      path = `${rental.id}/${crypto.randomUUID()}.${extension}`;
      const { error: uploadError } = await supabase.storage
        .from(CHAT_IMAGE_BUCKET)
        .upload(path, image, { contentType: image.type });
      if (uploadError) {
        return NextResponse.json({ error: uploadError.message }, { status: 500 });
      }
    }

    // Stored exactly as typed. It is displayed as plain text and never interpolated into
    // a prompt without being wrapped in <untrusted> first, per CLAUDE.md section 6, so
    // there is nothing to gain by rewriting it on the way in.
    const { error } = await supabase.from("messages").insert({
      onchain_rental_id: Number(rental.id),
      sender_address: caller,
      // Worked out here from the chain and stored, so counting unread messages later
      // needs no idea of who is in which rental and no second trip to the contract.
      recipient_address: counterparty,
      body: text || null,
      image_path: path,
    });

    if (error) {
      // A photo in the bucket with no message pointing at it is rubbish nobody will ever
      // find, so it goes back out with the failed write.
      if (path) await supabase.storage.from(CHAT_IMAGE_BUCKET).remove([path]);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (error) {
    if (error instanceof AuthError) return errorResponse(error, 401);
    if (error instanceof RentalError) return errorResponse(error, error.status);
    return errorResponse(error);
  }
}

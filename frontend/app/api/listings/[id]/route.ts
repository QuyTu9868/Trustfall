import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/api";
import { ModerationUnavailable, moderateListing } from "@/lib/moderation";
import { AuthError, readIdentityToken, walletFromIdentityToken } from "@/lib/privy-server";
import { LISTING_IMAGE_BUCKET, getSupabaseAdmin } from "@/lib/supabase-server";
import { applyVerdict, firstTextProblem } from "../route";

/**
 * Reads one listing back with its images.
 *
 * Used by the confirmation screen after publishing, which reads from the database rather
 * than redisplaying what was typed. Showing the form's own state back proves the form
 * works; reading it back proves the write actually landed.
 */
export async function GET(
  _request: Request,
  props: { params: Promise<{ id: string }> }
) {
  try {
    // Next 16 makes params a promise, synchronous access was removed.
    const { id } = await props.params;

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("listings")
      .select(
        "id, owner_address, category, title, description, price_per_day, deposit, status, moderation_status, created_at, listing_images(url, sort_order, uploaded_at)"
      )
      .eq("id", id)
      .single();

    if (error || !data) {
      return NextResponse.json({ error: "Listing not found." }, { status: 404 });
    }

    const images = [...(data.listing_images ?? [])].sort(
      (a, b) => a.sort_order - b.sort_order
    );

    return NextResponse.json({ ...data, listing_images: images });
  } catch (error) {
    // Missing configuration and an unreachable database both land here. Say which.
    return errorResponse(error);
  }
}

/**
 * The owner edits a rejected listing and sends it back for checking.
 *
 * Only the words change here. Photos are left alone, because a rejection almost always
 * names something in the description, and re-uploading two files to fix a sentence is a
 * good way to make people give up instead. Wrong photos are handled by deleting the
 * listing and starting again.
 *
 * The check runs again on the new text with the existing photos, so a listing cannot be
 * fixed by editing the wording around a picture that was the actual problem.
 */
export async function PATCH(request: Request, props: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await props.params;
    const owner = await walletFromIdentityToken(await readIdentityToken(request));
    const supabase = getSupabaseAdmin();

    const { data: existing } = await supabase
      .from("listings")
      .select("owner_address, listing_images(url)")
      .eq("id", id)
      .maybeSingle();

    if (!existing) return NextResponse.json({ error: "No such listing." }, { status: 404 });
    // Ownership from the verified token, never from the request. Otherwise anybody could
    // rewrite anybody's listing by knowing its id.
    if (existing.owner_address !== owner) {
      return NextResponse.json({ error: "That listing is not yours." }, { status: 403 });
    }

    const form = await request.formData();
    const title = String(form.get("title") ?? "").trim();
    const description = String(form.get("description") ?? "").trim();
    const pricePerDay = Number(form.get("pricePerDay"));
    const deposit = Number(form.get("deposit"));
    const category = String(form.get("category") ?? "");

    // Text only: the stored photos are reused untouched, so there is nothing to validate
    // about them here.
    const problem = firstTextProblem({ category, title, description, pricePerDay, deposit });
    if (problem) return NextResponse.json({ error: problem }, { status: 400 });

    // Back to pending first. If the check never finishes, the listing is left honestly
    // marked as waiting rather than still showing an old verdict about older words.
    await supabase
      .from("listings")
      .update({
        category,
        title,
        description,
        price_per_day: pricePerDay,
        deposit,
        status: "draft",
        moderation_status: "pending",
        moderation_reason: null,
      })
      .eq("id", id);

    const verdict = await moderateListing({
      title,
      description,
      images: await urlsToDataUrls(existing.listing_images.map((image) => image.url)),
      listingId: id,
    });

    await applyVerdict(id, owner, title, verdict);

    return NextResponse.json(
      { id, decision: verdict.decision, reasons: verdict.reasons },
      { status: verdict.decision === "approve" ? 200 : 422 }
    );
  } catch (error) {
    if (error instanceof AuthError) return errorResponse(error, 401);
    if (error instanceof ModerationUnavailable) return errorResponse(error, 503);
    return errorResponse(error);
  }
}

/** The owner throws a listing away, photos and all. */
export async function DELETE(request: Request, props: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await props.params;
    const owner = await walletFromIdentityToken(await readIdentityToken(request));
    const supabase = getSupabaseAdmin();

    const { data: existing } = await supabase
      .from("listings")
      .select("owner_address")
      .eq("id", id)
      .maybeSingle();

    if (!existing) return NextResponse.json({ error: "No such listing." }, { status: 404 });
    if (existing.owner_address !== owner) {
      return NextResponse.json({ error: "That listing is not yours." }, { status: 403 });
    }

    // Storage first. The rows cascade away with the listing, and once they are gone the
    // paths to the files are gone with them.
    await supabase.storage
      .from(LISTING_IMAGE_BUCKET)
      .remove(["0", "1"].map((n) => `${id}/${n}.jpg`).concat([`${id}/0.png`, `${id}/1.png`]));
    await supabase.from("listings").delete().eq("id", id);

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof AuthError) return errorResponse(error, 401);
    return errorResponse(error);
  }
}

/** Fetches stored photos back so the checker sees the same pictures a browser would. */
async function urlsToDataUrls(urls: string[]) {
  return Promise.all(
    urls.map(async (url) => {
      const response = await fetch(url);
      const buffer = Buffer.from(await response.arrayBuffer());
      const type = response.headers.get("content-type") ?? "image/jpeg";
      return `data:${type};base64,${buffer.toString("base64")}`;
    })
  );
}

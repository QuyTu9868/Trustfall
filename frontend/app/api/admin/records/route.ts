import { NextResponse } from "next/server";
import { freshCodeIsWrong, hasAdminSession } from "@/lib/admin-session";
import { errorResponse } from "@/lib/api";
import {
  DISPUTE_EVIDENCE_BUCKET,
  LISTING_IMAGE_BUCKET,
  getSupabaseAdmin,
} from "@/lib/supabase-server";

/**
 * The one place /admin can change something rather than only read it.
 *
 * Worth being uncomfortable about, and worth saying why it exists anyway. Everything else
 * under /admin is a record, and a record somebody can edit is weaker evidence than one they
 * cannot. This route makes that trade deliberately: a demo accumulates test rentals that
 * nobody wants in the log, and the alternative was a second admin surface somewhere else,
 * which hides the same power behind a different door and pretends the log is untouchable.
 *
 * What it cannot do is the important half. Rentals live on the contract, which has no admin
 * function at all: nothing here moves a deposit, reverses a settlement, or removes a rental.
 * Deleting the record of a dispute leaves the dispute itself on Sepolia, with the same money
 * in the same place, readable by anybody with the rental id. So this deletes Trustfall's
 * account of what happened and never what happened.
 *
 * That asymmetry is the honest description of it: the chain is the source of truth, and this
 * is a filing cabinet next to it.
 */
/**
 * Two gates, not one.
 *
 * The session says somebody signed in recently. The code says they have the authenticator
 * now. Reading the log needs the first; destroying part of it needs both, because those are
 * different powers and a stolen cookie should not carry the second one.
 *
 * It is also what closes the sign-out hole. The cookie validates itself, so a copy of it
 * outlives a sign-out no matter what the sign-out does, and the answer is to make sure that
 * copy cannot delete anything.
 */
async function guard(code: unknown) {
  if (!(await hasAdminSession())) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  const wrong = freshCodeIsWrong(code);
  if (wrong) return NextResponse.json({ error: wrong }, { status: 401 });
  return null;
}

/** Removes files without failing the delete: an orphaned object is tidier than a half state. */
async function removeAll(bucket: string, paths: string[]) {
  if (!paths.length) return;
  await getSupabaseAdmin().storage.from(bucket).remove(paths);
}

export async function DELETE(request: Request) {
  try {
    const url = new URL(request.url);
    const denied = await guard(url.searchParams.get("code"));
    if (denied) return denied;

    const rentalId = url.searchParams.get("rentalId");
    const listingId = url.searchParams.get("listingId");
    const supabase = getSupabaseAdmin();

    if (rentalId) {
      const id = Number(rentalId);
      if (!Number.isInteger(id) || id < 1) {
        return NextResponse.json({ error: "That is not a rental id." }, { status: 400 });
      }

      // Photographs first, because the rows are what say where they live. Losing the rows
      // and keeping the files would leave objects nobody can find or account for.
      const [{ data: evidence }, { data: handover }] = await Promise.all([
        supabase.from("dispute_evidence").select("image_path").eq("onchain_rental_id", id),
        supabase.from("handover_photos").select("image_path").eq("onchain_rental_id", id),
      ]);
      await removeAll(
        DISPUTE_EVIDENCE_BUCKET,
        [...(evidence ?? []), ...(handover ?? [])]
          .map((row) => row.image_path)
          .filter((path): path is string => Boolean(path))
      );

      for (const table of [
        "dispute_verdicts",
        "dispute_evidence",
        "dispute_appeals",
        "handover_photos",
        "messages",
      ]) {
        // A table that does not exist in this deployment is not a failure. Migrations 011
        // and 012 are recent, and a database one behind should still be tidiable.
        const { error } = await supabase.from(table).delete().eq("onchain_rental_id", id);
        if (error && error.code !== "42P01") {
          return NextResponse.json({ error: `${table}: ${error.message}` }, { status: 500 });
        }
      }

      return NextResponse.json({ ok: true, note: `Rental #${id} is untouched on chain.` });
    }

    if (listingId) {
      const { data: images } = await supabase
        .from("listing_images")
        .select("url")
        .eq("listing_id", listingId);

      // Stored under {listingId}/{n}.jpg, which is why the id alone is enough to name them
      // and the public URL does not have to be picked apart.
      await removeAll(
        LISTING_IMAGE_BUCKET,
        (images ?? []).map((_, index) => `${listingId}/${index}.jpg`)
      );

      for (const table of ["listing_images", "listing_checks"]) {
        const { error } = await supabase.from(table).delete().eq("listing_id", listingId);
        if (error && error.code !== "42P01") {
          return NextResponse.json({ error: `${table}: ${error.message}` }, { status: 500 });
        }
      }

      const { error } = await supabase.from("listings").delete().eq("id", listingId);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });

      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Name a rentalId or a listingId." }, { status: 400 });
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * Edits a listing, and only a listing.
 *
 * Listings are Trustfall's own data, written before any money exists and changeable without
 * contradicting anything. A rental is the opposite: its price, deposit and dates were
 * arguments to a transaction that has already been mined, so an edit here would only ever
 * produce a page that disagrees with the chain.
 */
const FIELDS = ["title", "description", "price_per_day", "deposit", "category"] as const;

export async function PATCH(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const denied = await guard(body.code);
    if (denied) return denied;

    const listingId = String(body.listingId ?? "");
    if (!listingId) return NextResponse.json({ error: "Which listing?" }, { status: 400 });

    // Named one by one rather than spread in. A body that arrives carrying owner_address or
    // moderation_status would otherwise rewrite who owns a listing, or mark a rejected one
    // approved, through a route that is meant to fix a typo in a title.
    const patch: Record<string, string> = {};
    for (const field of FIELDS) {
      if (typeof body[field] === "string" && body[field]) patch[field] = body[field] as string;
    }
    if (!Object.keys(patch).length) {
      return NextResponse.json({ error: "Nothing to change." }, { status: 400 });
    }

    const { error } = await getSupabaseAdmin().from("listings").update(patch).eq("id", listingId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true, changed: Object.keys(patch) });
  } catch (error) {
    return errorResponse(error);
  }
}

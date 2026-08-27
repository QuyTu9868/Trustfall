import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/api";
import { notify } from "@/lib/notify";
import { AuthError, readIdentityToken, walletFromIdentityToken } from "@/lib/privy-server";
import { RentalError, readRentalAsParty } from "@/lib/rental-server";
import { getSupabaseAdmin } from "@/lib/supabase-server";

/**
 * Writes one review.
 *
 * Two things are checked here and neither is taken from the request body. Who is writing
 * comes from the verified Privy token, and whether the rental is finished comes from the
 * chain. CLAUDE.md section 8 fixes the rule that reviews only open once a rental reaches
 * Completed, and the contract is the only thing that actually knows that. A client can
 * claim any state it likes, so the claim is ignored and the rental is read instead.
 */
export async function POST(request: Request) {
  try {
    const reviewer = await walletFromIdentityToken(await readIdentityToken(request));
    const { rentalId, rating, comment } = await request.json();

    const score = Number(rating);
    if (!Number.isInteger(score) || score < 1 || score > 5) {
      return NextResponse.json({ error: "Rating must be 1 to 5." }, { status: 400 });
    }
    if (typeof comment === "string" && comment.length > 1000) {
      return NextResponse.json({ error: "Comment is too long." }, { status: 400 });
    }
    const { rental, counterparty } = await readRentalAsParty(rentalId, reviewer);

    if (rental.status !== "Completed") {
      return NextResponse.json(
        { error: `Reviews open once the rental is completed. This one is ${rental.status}.` },
        { status: 409 }
      );
    }

    const { error } = await getSupabaseAdmin()
      .from("reviews")
      .insert({
        onchain_rental_id: Number(rentalId),
        reviewer_address: reviewer,
        reviewee_address: counterparty,
        rating: score,
        comment: typeof comment === "string" ? comment.trim() || null : null,
      });

    // The unique constraint on (rental, reviewer) is what stops a second review, so a
    // duplicate is an expected answer rather than a failure worth a 500.
    if (error?.code === "23505") {
      return NextResponse.json({ error: "You already reviewed this rental." }, { status: 409 });
    }
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Reviews are two way and neither side sees the other's until both are in, so without
    // this the first person to write one is waiting on something they cannot see coming.
    if (counterparty !== reviewer) await notify(counterparty, "reviewed", rental);

    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (error) {
    if (error instanceof AuthError) return errorResponse(error, 401);
    if (error instanceof RentalError) return errorResponse(error, error.status);
    return errorResponse(error);
  }
}

/**
 * Every review written about one rental, both sides.
 *
 * Open to anyone, no token needed. Reviews are the part of a marketplace that has to be
 * public to be worth anything, and the RLS policy on the table says the same.
 */
export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const rentalId = params.get("rentalId");
    // Everything written about one person, for their own profile. Same public data, asked
    // a different way: one rental's worth, or one person's worth.
    const about = params.get("about")?.toLowerCase();

    if (!rentalId && !about) {
      return NextResponse.json({ error: "Which rental, or about whom?" }, { status: 400 });
    }

    let query = getSupabaseAdmin()
      .from("reviews")
      .select("id, onchain_rental_id, reviewer_address, reviewee_address, rating, comment, created_at")
      .order("created_at", { ascending: false });

    query = rentalId
      ? query.eq("onchain_rental_id", Number(rentalId))
      : query.eq("reviewee_address", about!);

    const { data, error } = await query;

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ reviews: data ?? [] });
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * A reviewee clears one review about them. Scoped to reviews about the caller and never
 * to reviews the caller wrote about somebody else - deleting your own unflattering review
 * of a counterparty is exactly the self-serving edit that reviews being public exists to
 * prevent. This is a demo-account concession, not a production reputation feature.
 */
export async function DELETE(request: Request) {
  try {
    const caller = await walletFromIdentityToken(await readIdentityToken(request));
    const id = new URL(request.url).searchParams.get("id");
    if (!id) return NextResponse.json({ error: "Which review?" }, { status: 400 });

    const { error } = await getSupabaseAdmin()
      .from("reviews")
      .delete()
      .eq("id", id)
      .eq("reviewee_address", caller);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof AuthError) return errorResponse(error, 401);
    return errorResponse(error);
  }
}

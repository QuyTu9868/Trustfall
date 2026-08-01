import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/api";
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
    const rentalId = new URL(request.url).searchParams.get("rentalId");
    if (!rentalId) {
      return NextResponse.json({ error: "Which rental?" }, { status: 400 });
    }

    const { data, error } = await getSupabaseAdmin()
      .from("reviews")
      .select("reviewer_address, reviewee_address, rating, comment, created_at")
      .eq("onchain_rental_id", Number(rentalId))
      .order("created_at");

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ reviews: data ?? [] });
  } catch (error) {
    return errorResponse(error);
  }
}

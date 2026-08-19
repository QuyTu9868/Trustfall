import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/api";
import { notify } from "@/lib/notify";
import { AuthError, readIdentityToken, walletFromIdentityToken } from "@/lib/privy-server";
import { readRentalAsParty } from "@/lib/rental-server";
import { resolveDispute } from "@/lib/resolve-dispute";
import { getSupabaseAdmin } from "@/lib/supabase-server";

const MAX_STATEMENT = 1500;

/**
 * One more word after the ruling, and what it can still change.
 *
 * The arbitrator runs at temperature zero, so asking it the same question twice gets the
 * same answer. An appeal that only said "look again" would be theatre; this one has to
 * carry an argument the agent did not have.
 *
 * What it can do depends entirely on where the deposit is:
 *
 * - Still Disputed. Nothing has been paid out, either because the ruling was below the
 *   confidence bar or because signing failed. The dispute is judged again with the appeal
 *   in evidence, and the answer can genuinely differ because the input has.
 * - Anything else. The contract has already moved the money and no route can call it back.
 *   The appeal is recorded and the caller is told plainly that this is what happened,
 *   because a button that quietly does nothing is worse than no button.
 */
export async function POST(request: Request) {
  try {
    const caller = await walletFromIdentityToken(await readIdentityToken(request));
    const { rentalId, statement } = await request.json();

    const words = String(statement ?? "").trim();
    if (!words) return NextResponse.json({ error: "Say what was missed." }, { status: 400 });
    if (words.length > MAX_STATEMENT) {
      return NextResponse.json({ error: "That is too long." }, { status: 400 });
    }

    const { rental } = await readRentalAsParty(rentalId, caller);
    const supabase = getSupabaseAdmin();

    // There has to be a ruling to appeal against. Without this, the first person to file
    // could appeal before the other side had even answered.
    const { data: verdict } = await supabase
      .from("dispute_verdicts")
      .select("signed")
      .eq("onchain_rental_id", Number(rental.id))
      .maybeSingle();

    if (!verdict) {
      return NextResponse.json(
        { error: "Nothing has been decided yet, so there is nothing to appeal." },
        { status: 409 }
      );
    }

    const settled = rental.status !== "Disputed";
    const side = caller === rental.owner ? "owner" : "renter";

    const { error } = await supabase.from("dispute_appeals").insert({
      onchain_rental_id: Number(rental.id),
      side,
      author_address: caller,
      statement: words,
      after_settlement: settled,
    });

    if (error?.code === "23505") {
      return NextResponse.json({ error: "You have already appealed once." }, { status: 409 });
    }
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Told before the re-judging below, not after. If the arbitrator does change its mind
    // the other side gets a second notification saying so, and knowing an appeal was made
    // is worth having either way.
    const other = caller === rental.owner ? rental.renter : rental.owner;
    if (other !== caller) await notify(other, "appealed", rental);

    if (settled) {
      return NextResponse.json({
        rejudged: false,
        message:
          "The deposit has already been paid out and the contract cannot take it back. Your appeal is on the record, beside the ruling it disagrees with.",
      });
    }

    // Judged again, with the appeal now among the evidence. Recorded either way: an appeal
    // the arbitrator could not be reached for is still an appeal that was made.
    try {
      const ruling = await resolveDispute(rental.id);
      return NextResponse.json({ rejudged: true, ruling });
    } catch (cause) {
      return NextResponse.json({
        rejudged: false,
        message:
          cause instanceof Error
            ? `Your appeal is recorded, but the arbitrator could not be asked again: ${cause.message}`
            : "Your appeal is recorded, but the arbitrator could not be asked again.",
      });
    }
  } catch (error) {
    if (error instanceof AuthError) return errorResponse(error, 401);
    return errorResponse(error);
  }
}

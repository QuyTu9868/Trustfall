import { NextResponse } from "next/server";
import { freshCodeIsWrong, hasAdminSession } from "@/lib/admin-session";
import { NotSigned, signVerdict } from "@/lib/agent-signer";
import { errorResponse } from "@/lib/api";
import { notifyRuling } from "@/lib/notify";
import { RentalError, readRental } from "@/lib/rental-server";
import { getSupabaseAdmin } from "@/lib/supabase-server";

/**
 * The one dispute a person may decide: the one the arbitrator could not.
 *
 * Deliberately narrow, and the narrowness is the design rather than a limitation. A ruling
 * the agent reached and the server acted on cannot be touched here at all. What this reaches
 * is the state that had no way out: a verdict recorded with signed = false, because the
 * confidence was under the bar or the gateway refused it or the signing failed. Before this
 * those sat until the seven day timeout handed the deposit to the renter, which is the right
 * answer when nobody is watching and the wrong one when the owner was in the right and the
 * machine merely hesitated.
 *
 * Nothing about the chain changes. The contract still accepts one address and the server
 * still holds that key, so this signs exactly what the agent would have signed. The only new
 * thing is who chose the word, and the log records that rather than letting a human decision
 * wear the model's name.
 *
 * Two guards, the same pair the delete route uses, and for the same reason: a session cookie
 * validates itself and cannot be revoked, so a live six digit code is required on every call
 * that moves money. Signing out is not enough on its own.
 */
const VERDICTS = ["refund_renter", "split", "pay_owner"] as const;
type Verdict = (typeof VERDICTS)[number];

const MAX_NOTE = 500;

export async function POST(request: Request) {
  try {
    if (!(await hasAdminSession())) {
      return NextResponse.json({ error: "Not signed in." }, { status: 401 });
    }

    const { rentalId, verdict, code, note } = await request.json();

    const wrong = freshCodeIsWrong(code);
    if (wrong) return NextResponse.json({ error: wrong }, { status: 401 });

    if (!VERDICTS.includes(verdict as Verdict)) {
      return NextResponse.json({ error: "Not one of the three outcomes." }, { status: 400 });
    }

    const words = String(note ?? "").trim();
    if (!words) {
      // Required, not optional. This is the one decision in the app with no model behind it
      // to explain itself, so the person makes the record instead.
      return NextResponse.json({ error: "Say why you are deciding this." }, { status: 400 });
    }
    if (words.length > MAX_NOTE) {
      return NextResponse.json({ error: "That is too long." }, { status: 400 });
    }

    let id: bigint;
    try {
      id = BigInt(String(rentalId));
    } catch {
      return NextResponse.json({ error: "That is not a rental id." }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();

    // The gate that makes this route narrow. A verdict must exist, so the arbitrator has
    // actually been asked, and it must be unsigned, so nothing has been acted on. Both are
    // read from the record rather than taken from the request.
    const { data: existing } = await supabase
      .from("dispute_verdicts")
      .select("signed")
      .eq("onchain_rental_id", Number(id))
      .maybeSingle();

    if (!existing) {
      return NextResponse.json(
        { error: "The arbitrator has not ruled on this one yet. Ask it first." },
        { status: 409 }
      );
    }
    if (existing.signed) {
      return NextResponse.json(
        { error: "This was decided and acted on. Nobody overrules that, including you." },
        { status: 409 }
      );
    }

    // And the chain, which is the only authority on whether the deposit is still there to
    // be split. A dispute finalised by the timeout in the meantime is already over.
    const rental = await readRental(id);
    if (rental.status !== "Disputed") {
      return NextResponse.json(
        { error: `Rental #${id} is ${rental.status}, not in dispute.` },
        { status: 409 }
      );
    }

    let txHash: string;
    try {
      txHash = await signVerdict(id, verdict as Verdict);
    } catch (error) {
      const why = error instanceof NotSigned || error instanceof Error ? error.message : "Signing failed.";
      return NextResponse.json({ error: why }, { status: 502 });
    }

    // Written after the money moved, and loudly if it cannot be: a deposit that has moved
    // with no record of who chose to move it is the worst outcome this route has.
    const { error: logError } = await supabase
      .from("dispute_verdicts")
      .update({
        verdict,
        signed: true,
        tx_hash: txHash,
        settled_by: "admin",
        settled_note: words,
      })
      .eq("onchain_rental_id", Number(id));

    if (logError) {
      throw new Error(
        `Rental #${id} was settled by hand as ${verdict} in ${txHash}, but the record could not be updated: ${logError.message}`
      );
    }

    // Both parties, same as when the arbitrator decides. Being told a person made the call
    // matters more than being told the machine did, not less.
    await notifyRuling([rental.owner, rental.renter], id, {
      verdict: verdict as Verdict,
      signed: true,
      heldBack: null,
      by: "admin",
    });

    return NextResponse.json({ ok: true, txHash });
  } catch (error) {
    if (error instanceof RentalError) return errorResponse(error, error.status);
    return errorResponse(error);
  }
}

import { NextResponse } from "next/server";
import { MIN_CONFIDENCE } from "@/lib/arbitrate";
import { cameThroughGateway } from "@/lib/agent-gateway";
import { NotSigned, signVerdict } from "@/lib/agent-signer";
import { errorResponse } from "@/lib/api";
import { RentalError, readRental } from "@/lib/rental-server";
import { getSupabaseAdmin } from "@/lib/supabase-server";

/**
 * The only route that turns an arbitrator's word into a transaction.
 *
 * This is the upstream a policy gateway sits in front of, and everything about the request
 * is shaped by that. The body carries a rental id and one of three words. It carries no
 * amount, no address, and no instruction about where money goes, so the worst a compromised
 * agent or a misconfigured filter can produce is the wrong one of three outcomes on a
 * rental that was already being argued over.
 *
 * Three checks, and none of them believe the caller:
 *   the rental is read back off the chain and has to actually be in dispute,
 *   the verdict has to be one of the three the contract knows,
 *   the confidence has to clear the bar, or nothing is signed at all.
 *
 * The last one is repeated here on purpose. The agent already applies it before proposing,
 * and that copy is the one an attacker would remove.
 */
const VERDICTS = ["refund_renter", "split", "pay_owner"];

type Proposal = {
  rentalId: string;
  verdict: string;
  confidence: number;
  reason: string;
  findings?: { from: string; says: string }[];
  model?: string;
  evidenceSeen?: string;
};

export async function POST(request: Request) {
  try {
    const gate = cameThroughGateway(request);
    if (!gate.ok) {
      return NextResponse.json({ error: "Not through the gateway." }, { status: 401 });
    }

    const body = (await request.json()) as Proposal;

    if (!VERDICTS.includes(body.verdict)) {
      return NextResponse.json(
        { error: `Not a verdict this contract knows: ${body.verdict}` },
        { status: 400 }
      );
    }

    const confidence = Number(body.confidence);
    if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
      return NextResponse.json({ error: "Confidence is not a number from 0 to 1." }, { status: 400 });
    }

    let rentalId: bigint;
    try {
      rentalId = BigInt(String(body.rentalId));
    } catch {
      return NextResponse.json({ error: "That is not a rental id." }, { status: 400 });
    }

    // Read back from the chain rather than believed. A dispute already settled must not be
    // judged twice, and the caller is the last thing that should be deciding whether it was.
    const rental = await readRental(rentalId);
    if (rental.status !== "Disputed") {
      return NextResponse.json(
        { error: `Rental #${rentalId} is ${rental.status}, not in dispute.` },
        { status: 409 }
      );
    }

    let signed = false;
    let txHash: string | null = null;
    let heldBack: string | null = null;

    /**
     * The second bar, and unlike the first it is not about how sure the agent says it is.
     *
     * pay_owner is the finding that the renter returned the item worse than they got it.
     * The evidence for that is a photograph of it coming back, and if nobody took one then
     * no amount of confidence can supply it. This is checked here, against the server's own
     * table, because evidenceSeen in the body is a sentence the agent wrote about itself.
     *
     * A real ruling went the other way for want of this. The renter photographed a smashed
     * headlight at collection and wrote that it was already broken; there was no check-out
     * photograph at all; the agent read the check-in picture as proof of damage rather than
     * as the baseline it is, and took the whole deposit at confidence 1.00. Both existing
     * bars passed it: the gateway wants 0.9 for pay_owner and the server wants 0.6. Neither
     * catches a model that is confidently wrong, which is what this is for.
     *
     * Only pay_owner. A dispute opened while the item is still out has no check-out to
     * photograph by definition, and blocking split as well would push every one of those
     * to the timeout.
     */
    let missingCheckOut = false;
    if (body.verdict === "pay_owner") {
      const { data: photos } = await getSupabaseAdmin()
        .from("handover_photos")
        .select("phase")
        .eq("onchain_rental_id", Number(rentalId))
        .eq("phase", "checkout");
      missingCheckOut = !photos?.length;
    }

    if (missingCheckOut) {
      heldBack =
        "Nobody photographed the item coming back, so there is no evidence of the condition it was returned in. A ruling that the renter damaged it cannot rest on that, whatever the arbitrator's confidence. Somebody has to decide this one.";
    } else if (confidence < MIN_CONFIDENCE) {
      heldBack = `Confidence ${Math.round(confidence * 100)}% is below ${Math.round(MIN_CONFIDENCE * 100)}%, so nothing was signed.`;
    } else {
      try {
        txHash = await signVerdict(rentalId, body.verdict as (typeof VERDICTS)[number] & never);
        signed = true;
      } catch (error) {
        heldBack =
          error instanceof NotSigned || error instanceof Error ? error.message : "Signing failed.";
      }
    }

    const { error: logError } = await getSupabaseAdmin().from("dispute_verdicts").upsert(
      {
        onchain_rental_id: Number(rentalId),
        // What the hop did, recorded from the far side of it. A request that arrives here
        // with the gateway's credential on it got through a policy; one that arrives
        // without, on a server with no secret configured, went straight from the agent to
        // the signer with nothing in between. Both are worth being able to tell apart, and
        // until now only the refusal left a trace.
        gateway: gate.guarded ? "passed" : "direct",
        gateway_note: gate.guarded
          ? "The policy read this proposal and let it through with its credential attached."
          : "No gateway in front of this server, so the proposal reached the signer directly.",
        verdict: body.verdict,
        confidence,
        reason: body.reason,
        findings: body.findings ?? [],
        signed,
        tx_hash: txHash,
        held_back_reason: heldBack,
        model: body.model ?? "unknown",
        evidence_seen: body.evidenceSeen ?? "statements and conversation",
      },
      { onConflict: "onchain_rental_id" }
    );

    // Loud, because of what silence costs here. This write failed once for a missing column
    // and nobody noticed: a deposit had moved on chain and the only record of why was the
    // one that did not get written.
    if (logError) {
      throw new Error(
        `Rental #${rentalId} was decided${signed ? " and signed" : ""} but the verdict could not be recorded: ${logError.message}`
      );
    }

    return NextResponse.json({ signed, txHash, heldBack, guarded: gate.guarded });
  } catch (error) {
    // A rental id nobody minted is the caller's mistake, not the server's, and it carries
    // its own status. Without this it came back 500, which reads as "we broke" rather than
    // "there is no such thing".
    if (error instanceof RentalError) return errorResponse(error, error.status);
    return errorResponse(error);
  }
}

import "server-only";
import { MIN_CONFIDENCE, arbitrate } from "./arbitrate";
import { NotSigned, signVerdict } from "./agent-signer";
import { ARBITRATION_MODEL } from "./model";
import { readRental } from "./rental-server";
import { DISPUTE_EVIDENCE_BUCKET, getSupabaseAdmin } from "./supabase-server";

/**
 * Runs a dispute end to end: gather, ask, check, sign, record.
 *
 * The order matters and it is the order CLAUDE.md section 6 asks for. The agent is given
 * evidence and returns a word. The server then re-derives everything it needs from the
 * chain and the database rather than believing any of it, and only then signs. The verdict
 * is written down either way, because a decision that was reached and deliberately not
 * acted on is exactly the thing somebody will want to read later.
 */
export async function resolveDispute(rentalId: bigint) {
  const supabase = getSupabaseAdmin();

  // Read back from the chain, not from whatever asked for this. A dispute that has been
  // resolved already, or was never opened, must not be judged twice.
  const rental = await readRental(rentalId);
  if (rental.status !== "Disputed") {
    throw new NotSigned(`Rental #${rentalId} is ${rental.status}, not in dispute.`);
  }

  const { data: evidence } = await supabase
    .from("dispute_evidence")
    .select("side, statement, image_path, created_at")
    .eq("onchain_rental_id", Number(rentalId))
    .order("created_at");

  if (!evidence?.length) throw new NotSigned("Nobody has submitted anything yet.");

  // Downloaded here rather than handed over as links, because the model is given the file
  // itself and a signed URL would only be a string it could not open. Sixty seconds is
  // plenty: the fetch happens immediately below.
  const photos = new Map<string, string>();
  const paths = evidence.map((row) => row.image_path).filter((path): path is string => Boolean(path));
  if (paths.length) {
    const { data: signed } = await supabase.storage
      .from(DISPUTE_EVIDENCE_BUCKET)
      .createSignedUrls(paths, 60);
    for (const entry of signed ?? []) {
      if (!entry.path || !entry.signedUrl) continue;
      try {
        const response = await fetch(entry.signedUrl);
        if (!response.ok) continue;
        const buffer = Buffer.from(await response.arrayBuffer());
        const type = response.headers.get("content-type") ?? "image/jpeg";
        photos.set(entry.path, `data:${type};base64,${buffer.toString("base64")}`);
      } catch {
        // One photograph that will not download is not a reason to abandon the dispute.
        // The arbitrator sees what arrived and evidence_seen below records the difference.
      }
    }
  }

  const { data: chat } = await supabase
    .from("messages")
    .select("sender_address, body, created_at")
    .eq("onchain_rental_id", Number(rentalId))
    .order("created_at");

  const verdict = await arbitrate({
    evidence: evidence.map((row) => ({
      side: row.side as "owner" | "renter",
      statement: row.statement,
      imageDataUrl: row.image_path ? (photos.get(row.image_path) ?? null) : null,
      submittedAt: row.created_at,
    })),
    chat: (chat ?? [])
      .filter((line) => line.body)
      .map((line) => ({
        sender: line.sender_address === rental.owner ? "owner" : "renter",
        body: line.body as string,
        at: line.created_at,
      })),
  });

  // The bar. Below it nothing is signed and the dispute waits for the human resolver the
  // contract already has, which is the honest outcome when the evidence does not settle
  // it. Seven days of silence and the deposit goes back to the renter by timeout.
  let signed = false;
  let txHash: string | null = null;
  let heldBack: string | null = null;

  if (verdict.confidence < MIN_CONFIDENCE) {
    heldBack = `Confidence ${verdict.confidence.toFixed(2)} is below ${MIN_CONFIDENCE}. Left for a human.`;
  } else {
    try {
      txHash = await signVerdict(rentalId, verdict.verdict);
      signed = true;
    } catch (error) {
      heldBack = error instanceof Error ? error.message : "Signing failed.";
    }
  }

  await supabase.from("dispute_verdicts").upsert(
    {
      onchain_rental_id: Number(rentalId),
      verdict: verdict.verdict,
      confidence: verdict.confidence,
      reason: verdict.reason,
      signed,
      tx_hash: txHash,
      held_back_reason: heldBack,
      model: ARBITRATION_MODEL,
      // What it actually read, recorded beside the ruling rather than assumed from the
      // fact that a photograph exists. A picture that failed to download is a picture the
      // arbitrator did not weigh, and only this line would ever say so.
      evidence_seen:
        photos.size > 0
          ? `statements, conversation and ${photos.size} photograph${photos.size === 1 ? "" : "s"}`
          : "statements and conversation",
    },
    { onConflict: "onchain_rental_id" }
  );

  return { ...verdict, signed, txHash, heldBack };
}

import "server-only";
import { MIN_CONFIDENCE, arbitrate } from "./arbitrate";
import { NotSigned, signVerdict } from "./agent-signer";
import { MODEL } from "./groq";
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

  // Signed links, valid for the length of one call. The bucket is private and stays that
  // way: these are photographs somebody filed in an argument about money.
  const paths = evidence.map((row) => row.image_path).filter((p): p is string => Boolean(p));
  const links = new Map<string, string>();
  if (paths.length) {
    const { data: signed } = await supabase.storage
      .from(DISPUTE_EVIDENCE_BUCKET)
      .createSignedUrls(paths, 600);
    for (const entry of signed ?? []) {
      if (entry.path && entry.signedUrl) links.set(entry.path, entry.signedUrl);
    }
  }

  const images = await Promise.all(
    evidence.map(async (row) => {
      if (!row.image_path) return null;
      const url = links.get(row.image_path);
      if (!url) return null;
      // Fetched and inlined rather than handed over as a link. A signed URL would work,
      // and would also mean posting a route into somebody's private bucket to a third
      // party, which is a thing to do on purpose or not at all.
      const response = await fetch(url);
      const buffer = Buffer.from(await response.arrayBuffer());
      const type = response.headers.get("content-type") ?? "image/jpeg";
      return `data:${type};base64,${buffer.toString("base64")}`;
    })
  );

  const { data: chat } = await supabase
    .from("messages")
    .select("sender_address, body, created_at")
    .eq("onchain_rental_id", Number(rentalId))
    .order("created_at");

  const verdict = await arbitrate({
    evidence: evidence.map((row, index) => ({
      side: row.side as "owner" | "renter",
      statement: row.statement,
      imageDataUrl: images[index],
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
      model: MODEL,
    },
    { onConflict: "onchain_rental_id" }
  );

  return { ...verdict, signed, txHash, heldBack };
}

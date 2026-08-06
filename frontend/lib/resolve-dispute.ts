import "server-only";
import { arbitrate } from "./arbitrate";
import { NotSigned } from "./agent-signer";
import { Blocked, propose } from "./agent-gateway";
import { bytes32ToListingId } from "./escrow";
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

  // What the owner advertised, which is older than anything else here. The chain stores the
  // listing id as bytes32, so it has to be turned back into the uuid the database uses.
  const listingId = bytes32ToListingId(rental.listingId);
  const [{ data: listing }, { data: listingImages }] = await Promise.all([
    supabase
      .from("listings")
      .select("title, description, created_at")
      .eq("id", listingId)
      .maybeSingle(),
    supabase
      .from("listing_images")
      .select("url")
      .eq("listing_id", listingId)
      .order("sort_order")
      .limit(2),
  ]);

  // What the item looked like at each handover. Taken before either side knew there would
  // be an argument, which is what makes the pair worth more than anything filed afterwards.
  const { data: handover } = await supabase
    .from("handover_photos")
    .select("phase, image_path, created_at")
    .eq("onchain_rental_id", Number(rentalId));

  // Downloaded rather than handed over as links, because the model is given the file itself
  // and a signed URL would only be a string it could not open. Sixty seconds is plenty: the
  // fetch happens immediately below.
  const photos = await downloadAll(supabase, [
    ...evidence.map((row) => row.image_path),
    ...(handover ?? []).map((row) => row.image_path),
  ]);

  // Filed after a ruling, by whoever disagreed with it. Read as evidence like everything
  // else, and weighted down in the policy for the obvious reason.
  const { data: appeals } = await supabase
    .from("dispute_appeals")
    .select("side, statement, created_at")
    .eq("onchain_rental_id", Number(rentalId))
    .order("created_at");

  const { data: chat } = await supabase
    .from("messages")
    .select("sender_address, body, created_at")
    .eq("onchain_rental_id", Number(rentalId))
    .order("created_at");

  const handoverPhotos = (handover ?? [])
    .map((row) => ({
      phase: row.phase as "checkin" | "checkout",
      imageDataUrl: photos.get(row.image_path),
      takenAt: row.created_at as string,
    }))
    .filter((row): row is { phase: "checkin" | "checkout"; imageDataUrl: string; takenAt: string } =>
      Boolean(row.imageDataUrl)
    );

  const filedPhotos = evidence.filter((row) => row.image_path && photos.has(row.image_path)).length;

  // Listing images live in a public bucket, so they are plain URLs rather than storage
  // paths and are fetched directly. One that will not load is left out, same as the rest.
  const listingPhotos: string[] = [];
  for (const image of listingImages ?? []) {
    try {
      const response = await fetch(image.url);
      if (!response.ok) continue;
      const buffer = Buffer.from(await response.arrayBuffer());
      const type = response.headers.get("content-type") ?? "image/jpeg";
      listingPhotos.push(`data:${type};base64,${buffer.toString("base64")}`);
    } catch {
      // Counted by what is in this array, never by what the query returned.
    }
  }

  const verdict = await arbitrate({
    listing: listing
      ? {
          title: listing.title,
          description: listing.description,
          postedAt: listing.created_at,
          imageDataUrls: listingPhotos,
        }
      : null,
    handover: handoverPhotos,
    appeals: (appeals ?? []).map((row) => ({
      side: row.side as "owner" | "renter",
      statement: row.statement as string,
      filedAt: row.created_at as string,
    })),
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

  // Out through the gateway rather than straight to the signer. CLAUDE.md section 6 asks
  // for exactly this order: the agent proposes over HTTP, something in the middle is
  // allowed to refuse, and only then does the server sign. Calling signVerdict from here
  // would leave that middle with nothing to inspect.
  //
  // The proposal names a rental and one of three words. No amount, no address, nothing
  // about where money goes: the contract reads the deposit from its own storage and does
  // the arithmetic, so a refused filter or a talked-into model can pick the wrong outcome
  // and cannot invent a payment.
  //
  // The confidence bar is applied on the other side, not here. This copy would be the one
  // an attacker removes, so the decision lives with the key.
  let signed = false;
  let txHash: string | null = null;
  let heldBack: string | null = null;

  try {
    const answer = await propose<{ signed: boolean; txHash: string | null; heldBack: string | null }>(
      "/api/agent/resolve-dispute",
      {
        rentalId: rentalId.toString(),
        verdict: verdict.verdict,
        confidence: verdict.confidence,
        reason: verdict.reason,
        findings: verdict.findings,
        model: verdict.model,
        evidenceSeen: describe(listingPhotos.length, handoverPhotos.length, filedPhotos),
      }
    );
    signed = answer.signed;
    txHash = answer.txHash;
    heldBack = answer.heldBack;
  } catch (error) {
    // A refusal is a result, not a failure to retry past. It is written down so the log
    // says a decision was reached and stopped at the gate, which is the whole reason the
    // gate is worth having.
    if (error instanceof Blocked) {
      heldBack = `Blocked by policy${error.deniedBy ? ` (${error.deniedBy})` : ""}: ${error.reason}`;
      await supabase.from("dispute_verdicts").upsert(
        {
          onchain_rental_id: Number(rentalId),
          verdict: verdict.verdict,
          confidence: verdict.confidence,
          reason: verdict.reason,
          findings: verdict.findings,
          signed: false,
          tx_hash: null,
          held_back_reason: heldBack,
          model: verdict.model,
          evidence_seen: describe(listingPhotos.length, handoverPhotos.length, filedPhotos),
        },
        { onConflict: "onchain_rental_id" }
      );
    } else {
      throw error;
    }
  }

  return { ...verdict, signed, txHash, heldBack };
}

/**
 * Every stored image as a data URL, keyed by its path.
 *
 * One that will not download is skipped rather than fatal. A dispute is still judgeable on
 * what did arrive, and describe() below records exactly how much that was, so the log never
 * implies the arbitrator saw a picture it never got.
 */
async function downloadAll(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  paths: (string | null)[]
) {
  const wanted = paths.filter((path): path is string => Boolean(path));
  const photos = new Map<string, string>();
  if (!wanted.length) return photos;

  const { data: signed } = await supabase.storage
    .from(DISPUTE_EVIDENCE_BUCKET)
    .createSignedUrls(wanted, 60);

  for (const entry of signed ?? []) {
    if (!entry.path || !entry.signedUrl) continue;
    try {
      const response = await fetch(entry.signedUrl);
      if (!response.ok) continue;
      const buffer = Buffer.from(await response.arrayBuffer());
      const type = response.headers.get("content-type") ?? "image/jpeg";
      photos.set(entry.path, `data:${type};base64,${buffer.toString("base64")}`);
    } catch {
      // Left out rather than retried. The count below is what keeps the log honest.
    }
  }
  return photos;
}

/**
 * What the arbitrator actually read, in a sentence, recorded beside the ruling.
 *
 * Counted rather than assumed from the fact that a photograph exists somewhere. A picture
 * that failed to download is a picture that was not weighed, and this line is the only
 * thing that would ever say so.
 */
function describe(listingCount: number, handoverCount: number, filedCount: number) {
  const parts = ["statements", "conversation"];
  if (listingCount) parts.push(`${listingCount} listing photograph${listingCount === 1 ? "" : "s"}`);
  if (handoverCount) parts.push(`${handoverCount} handover photograph${handoverCount === 1 ? "" : "s"}`);
  if (filedCount) parts.push(`${filedCount} filed photograph${filedCount === 1 ? "" : "s"}`);
  return parts.length === 2
    ? "statements and conversation"
    : `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}`;
}

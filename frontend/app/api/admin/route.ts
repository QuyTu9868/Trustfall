import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/api";
import { endAdminSession, hasAdminSession, startAdminSession } from "@/lib/admin-session";
import { readRental } from "@/lib/rental-server";
import { readSettlement } from "@/lib/settlement";
import { DISPUTE_EVIDENCE_BUCKET, getSupabaseAdmin } from "@/lib/supabase-server";
import { verifyCode } from "@/lib/totp";

/**
 * The admin log: what the arbitrator decided, and whether the server acted on it.
 *
 * Read only. Nothing here moves money and nothing could: the contract accepts a verdict
 * from the agent's address and from nowhere else. This exists to read what an automated
 * system did with somebody's deposit, which is the thing that has to be answerable
 * afterwards.
 *
 * Two shapes. Without rentalId it answers with the list, and deliberately without the
 * statements, photographs or conversation: a hundred rulings would mean a hundred signed
 * photo URLs generated so that a reader could look at one of them. With rentalId it answers
 * with everything about that single dispute.
 */
export async function GET(request: Request) {
  try {
    if (!(await hasAdminSession())) {
      return NextResponse.json({ error: "Not signed in." }, { status: 401 });
    }

    const params = new URL(request.url).searchParams;
    const rentalId = params.get("rentalId");
    const listingId = params.get("listingId");
    if (rentalId) return await one(Number(rentalId));
    if (listingId) return await oneListing(listingId);
    return await list();
  } catch (error) {
    return errorResponse(error);
  }
}

const COLUMNS =
  "onchain_rental_id, verdict, confidence, reason, signed, tx_hash, held_back_reason, model, evidence_seen, findings, created_at, settled_by, settled_note";

async function list() {
  const supabase = getSupabaseAdmin();

  // Both agents in one answer, because the question the page asks is what the agents have
  // been doing and there are two of them. The listing checker runs far more often, so it
  // is capped lower: a hundred rejections would bury four rulings about money.
  const [verdicts, checks, evidence] = await Promise.all([
    supabase
      .from("dispute_verdicts")
      .select(COLUMNS)
      .order("created_at", { ascending: false })
      .limit(100),
    supabase
      .from("listing_checks")
      .select("id, listing_id, decision, reasons, findings, model, created_at, listings(title)")
      .order("created_at", { ascending: false })
      .limit(50),
    // Filed but not yet a verdict: a dispute the arbitrator has not finished reading.
    // There is no separate "dispute opened" table, so this is read from the filings
    // themselves rather than from the chain.
    supabase
      .from("dispute_evidence")
      .select("onchain_rental_id, created_at")
      .order("created_at", { ascending: true }),
  ]);

  if (verdicts.error) return NextResponse.json({ error: verdicts.error.message }, { status: 500 });

  const judged = new Set((verdicts.data ?? []).map((row) => row.onchain_rental_id));
  const firstFiledAt = new Map<number, string>();
  for (const row of evidence.data ?? []) {
    if (judged.has(row.onchain_rental_id)) continue;
    if (!firstFiledAt.has(row.onchain_rental_id)) {
      firstFiledAt.set(row.onchain_rental_id, row.created_at);
    }
  }
  const pending = [...firstFiledAt.entries()].map(([onchain_rental_id, filed_at]) => ({
    onchain_rental_id,
    filed_at,
  }));

  return NextResponse.json({
    verdicts: verdicts.data ?? [],
    pending,
    // A missing listing_checks table is not a reason to hide the rulings. Migration 010
    // may not have been run yet, and the arbitrator log is the half that matters.
    checks: (checks.data ?? []).map((row) => {
      const { listings, ...rest } = row as typeof row & { listings: { title: string } | null };
      return { ...rest, title: listings?.title ?? null };
    }),
  });
}

async function one(rentalId: number) {
  if (!Number.isInteger(rentalId) || rentalId < 1) {
    return NextResponse.json({ error: "That is not a rental id." }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();

  const { data: verdict, error } = await supabase
    .from("dispute_verdicts")
    .select(COLUMNS)
    .eq("onchain_rental_id", rentalId)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!verdict) {
    return NextResponse.json({ error: "No verdict for that rental." }, { status: 404 });
  }

  // Everything that was filed, beside the ruling. Photographs are shown whether or not the
  // arbitrator was given them, because they are how a reader judges whether the ruling was
  // reasonable. evidence_seen on the verdict is what says which it was.
  const { data: evidence } = await supabase
    .from("dispute_evidence")
    .select("side, statement, image_path, created_at")
    .eq("onchain_rental_id", rentalId)
    .order("created_at");

  // The conversation, because findings cite it and a citation nobody can check is not
  // evidence of anything.
  const { data: chat } = await supabase
    .from("messages")
    .select("sender_address, body, created_at")
    .eq("onchain_rental_id", rentalId)
    .order("created_at");

  // The two handover photographs, separate from what was filed for the dispute itself.
  // These are taken unconditionally at check-in and check-out, dispute or not, and a
  // reader auditing a ruling should see the same "before and after" the arbitrator did.
  const { data: handover } = await supabase
    .from("handover_photos")
    .select("phase, image_path, note, created_at")
    .eq("onchain_rental_id", rentalId)
    .order("created_at");

  const paths = [
    ...(evidence ?? []).map((row) => row.image_path),
    ...(handover ?? []).map((row) => row.image_path),
  ].filter((path): path is string => Boolean(path));
  const links = new Map<string, string>();
  if (paths.length) {
    const { data: signed } = await supabase.storage
      .from(DISPUTE_EVIDENCE_BUCKET)
      .createSignedUrls(paths, 60 * 60);
    for (const entry of signed ?? []) {
      if (entry.path && entry.signedUrl) links.set(entry.path, entry.signedUrl);
    }
  }

  // Only for a ruling that was acted on. A held-back one has no transaction, so there is
  // nothing to read and nothing to show, which is itself the honest answer.
  const settled = verdict.signed && verdict.tx_hash ? await readSettlement(verdict.tx_hash) : null;

  // Who the two sides are, read off the chain rather than from the filings. A side that
  // never filed has no row to take an address from, and that is exactly the case where a
  // reader most wants to know who failed to answer.
  const parties = await readRental(BigInt(rentalId))
    .then((rental) => ({ owner: rental.owner, renter: rental.renter }))
    .catch(() => null);

  return NextResponse.json({
    verdict,
    settled,
    parties,
    evidence: (evidence ?? []).map((entry) => ({
      side: entry.side,
      statement: entry.statement,
      created_at: entry.created_at,
      image_url: entry.image_path ? (links.get(entry.image_path) ?? null) : null,
    })),
    handover: (handover ?? []).map((entry) => ({
      phase: entry.phase,
      note: entry.note,
      created_at: entry.created_at,
      image_url: entry.image_path ? (links.get(entry.image_path) ?? null) : null,
    })),
    chat: (chat ?? [])
      .filter((line) => line.body)
      .map((line) => ({
        sender_address: line.sender_address,
        body: line.body,
        created_at: line.created_at,
      })),
  });
}

/**
 * One listing, and every time the checker looked at it.
 *
 * The sequence is the point. A rejection followed by a fix followed by an approval is the
 * loop the product promises owners, and a single row cannot show it happened. Oldest first,
 * for the same reason.
 */
async function oneListing(listingId: string) {
  const supabase = getSupabaseAdmin();

  const [{ data: listing, error }, { data: images }, { data: checks }] = await Promise.all([
    supabase
      .from("listings")
      .select("id, title, description, category, price_per_day, deposit, status, moderation_status, moderation_reason, created_at")
      .eq("id", listingId)
      .maybeSingle(),
    supabase.from("listing_images").select("url").eq("listing_id", listingId).order("sort_order"),
    supabase
      .from("listing_checks")
      .select("id, decision, reasons, findings, model, created_at")
      .eq("listing_id", listingId)
      .order("created_at"),
  ]);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!listing) return NextResponse.json({ error: "No such listing." }, { status: 404 });

  return NextResponse.json({
    listing,
    images: (images ?? []).map((row) => row.url),
    checks: checks ?? [],
  });
}

/** Six digits from an authenticator app, exchanged for a session. */
export async function POST(request: Request) {
  try {
    const secret = process.env.ADMIN_TOTP_SECRET;
    if (!secret) {
      return NextResponse.json(
        { error: "No ADMIN_TOTP_SECRET set, so there is no way in. Run npm run admin:setup." },
        { status: 503 }
      );
    }

    const { code } = await request.json();
    if (!verifyCode(secret, String(code ?? ""))) {
      // One message for a wrong code and for a code from the wrong app. Saying which
      // would tell somebody guessing whether they had the right secret.
      return NextResponse.json({ error: "That code is not valid." }, { status: 401 });
    }

    await startAdminSession();
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE() {
  await endAdminSession();
  return NextResponse.json({ ok: true });
}

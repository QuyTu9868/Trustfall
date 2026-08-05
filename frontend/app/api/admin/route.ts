import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/api";
import { endAdminSession, hasAdminSession, startAdminSession } from "@/lib/admin-session";
import { DISPUTE_EVIDENCE_BUCKET, getSupabaseAdmin } from "@/lib/supabase-server";
import { verifyCode } from "@/lib/totp";

/**
 * The admin log: what the arbitrator decided, and whether the server acted on it.
 *
 * Read only. There is nothing here that moves money, on purpose: the contract already has
 * a human resolver and that power lives in a wallet key, not behind a web form. This is
 * for reading what an automated system did with somebody's deposit, which is the thing
 * that has to be answerable afterwards.
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

    const rentalId = new URL(request.url).searchParams.get("rentalId");
    return rentalId ? await one(Number(rentalId)) : await list();
  } catch (error) {
    return errorResponse(error);
  }
}

const COLUMNS =
  "onchain_rental_id, verdict, confidence, reason, signed, tx_hash, held_back_reason, model, evidence_seen, findings, created_at";

async function list() {
  const supabase = getSupabaseAdmin();

  // Both agents in one answer, because the question the page asks is what the agents have
  // been doing and there are two of them. The listing checker runs far more often, so it
  // is capped lower: a hundred rejections would bury four rulings about money.
  const [verdicts, checks] = await Promise.all([
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
  ]);

  if (verdicts.error) return NextResponse.json({ error: verdicts.error.message }, { status: 500 });

  return NextResponse.json({
    verdicts: verdicts.data ?? [],
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

  const paths = (evidence ?? [])
    .map((row) => row.image_path)
    .filter((path): path is string => Boolean(path));
  const links = new Map<string, string>();
  if (paths.length) {
    const { data: signed } = await supabase.storage
      .from(DISPUTE_EVIDENCE_BUCKET)
      .createSignedUrls(paths, 60 * 60);
    for (const entry of signed ?? []) {
      if (entry.path && entry.signedUrl) links.set(entry.path, entry.signedUrl);
    }
  }

  return NextResponse.json({
    verdict,
    evidence: (evidence ?? []).map((entry) => ({
      side: entry.side,
      statement: entry.statement,
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

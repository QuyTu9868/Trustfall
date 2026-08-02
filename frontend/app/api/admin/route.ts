import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/api";
import { endAdminSession, hasAdminSession, startAdminSession } from "@/lib/admin-session";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { verifyCode } from "@/lib/totp";

/**
 * The admin log: what the arbitrator decided, and whether the server acted on it.
 *
 * Read only. There is nothing here that moves money, on purpose: the contract already has
 * a human resolver and that power lives in a wallet key, not behind a web form. This is
 * for reading what an automated system did with somebody's deposit, which is the thing
 * that has to be answerable afterwards.
 */
export async function GET() {
  try {
    if (!(await hasAdminSession())) {
      return NextResponse.json({ error: "Not signed in." }, { status: 401 });
    }

    const { data, error } = await getSupabaseAdmin()
      .from("dispute_verdicts")
      .select(
        "onchain_rental_id, verdict, confidence, reason, signed, tx_hash, held_back_reason, model, created_at"
      )
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ verdicts: data ?? [] });
  } catch (error) {
    return errorResponse(error);
  }
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

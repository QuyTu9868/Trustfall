import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/api";
import { AuthError, readIdentityToken, walletFromIdentityToken } from "@/lib/privy-server";
import { getSupabaseAdmin } from "@/lib/supabase-server";

/**
 * How many unread messages are waiting, per conversation.
 *
 * Nothing is read from the request and the chain is never touched. Every message row
 * already records who it was addressed to, written from the chain at the time it was
 * sent, so a message counts as mine to read simply because it says so. That keeps this
 * endpoint to two queries no matter how many rentals somebody is part of, which matters
 * because the header polls it on every page.
 */
export async function GET(request: Request) {
  try {
    const caller = await walletFromIdentityToken(await readIdentityToken(request));
    const supabase = getSupabaseAdmin();

    const [{ data: inbox, error }, { data: reads }] = await Promise.all([
      supabase
        .from("messages")
        .select("onchain_rental_id, created_at")
        .eq("recipient_address", caller),
      supabase.from("thread_reads").select("onchain_rental_id, last_read_at").eq("address", caller),
    ]);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // A thread never opened has no read row at all, so everything in it is unread.
    const lastRead = new Map<number, number>();
    for (const row of reads ?? []) {
      lastRead.set(row.onchain_rental_id, new Date(row.last_read_at).getTime());
    }

    const counts: Record<string, number> = {};
    for (const message of inbox ?? []) {
      const seenAt = lastRead.get(message.onchain_rental_id) ?? 0;
      if (new Date(message.created_at).getTime() > seenAt) {
        counts[message.onchain_rental_id] = (counts[message.onchain_rental_id] ?? 0) + 1;
      }
    }

    const total = Object.values(counts).reduce((sum, n) => sum + n, 0);
    return NextResponse.json({ counts, total });
  } catch (error) {
    if (error instanceof AuthError) return errorResponse(error, 401);
    return errorResponse(error);
  }
}

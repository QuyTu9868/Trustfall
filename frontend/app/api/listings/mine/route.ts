import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/api";
import { AuthError, readIdentityToken, walletFromIdentityToken } from "@/lib/privy-server";
import { getSupabaseAdmin } from "@/lib/supabase-server";

/**
 * Everything this wallet has listed, whatever state it is in.
 *
 * The public queries only ever return listings that are published and approved, which is
 * right for browsing and useless for the person who wrote them. This is the only way an
 * owner sees a listing that was rejected, or one still waiting because the check was
 * interrupted, and without it those listings exist with nobody able to reach them.
 */
export async function GET(request: Request) {
  try {
    const owner = await walletFromIdentityToken(await readIdentityToken(request));

    const { data, error } = await getSupabaseAdmin()
      .from("listings")
      .select(
        "id, category, title, description, pickup_area, lat, lng, street_address, price_per_day, deposit, status, moderation_status, moderation_reason, created_at, listing_images(url, sort_order)"
      )
      .eq("owner_address", owner)
      .order("created_at", { ascending: false });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ listings: data ?? [] });
  } catch (error) {
    if (error instanceof AuthError) return errorResponse(error, 401);
    return errorResponse(error);
  }
}

import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/api";
import { fetchListingsByOwner } from "@/lib/listings-query";

/**
 * One address's published, approved listings. Public, no token.
 *
 * Same visibility rule as the browse grid: a listing still pending or rejected is the
 * owner's own business, reached instead through /api/listings/mine.
 */
export async function GET(request: Request) {
  try {
    const owner = new URL(request.url).searchParams.get("address")?.toLowerCase();
    if (!owner) return NextResponse.json({ error: "Missing address." }, { status: 400 });

    const listings = await fetchListingsByOwner(owner);
    return NextResponse.json({ listings });
  } catch (error) {
    return errorResponse(error);
  }
}

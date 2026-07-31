import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/api";
import { parseCategory } from "@/lib/listings-query";
import { fetchPriceHint } from "@/lib/listings-query";

/**
 * What comparable items charge. Read by the listing form as the owner picks a category.
 *
 * Returns null rather than a made up range when there is too little to go on. Silence is
 * the honest answer to "what should I charge" when three people have not answered it yet.
 */
export async function GET(request: Request) {
  try {
    const category = parseCategory(
      new URL(request.url).searchParams.get("category")
    );
    if (!category) {
      return NextResponse.json({ error: "Unknown category." }, { status: 400 });
    }
    return NextResponse.json({ hint: await fetchPriceHint(category) });
  } catch (error) {
    return errorResponse(error);
  }
}

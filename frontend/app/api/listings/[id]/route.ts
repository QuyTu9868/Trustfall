import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/api";
import { getSupabaseAdmin } from "@/lib/supabase-server";

/**
 * Reads one listing back with its images.
 *
 * Used by the confirmation screen after publishing, which reads from the database rather
 * than redisplaying what was typed. Showing the form's own state back proves the form
 * works; reading it back proves the write actually landed.
 */
export async function GET(
  _request: Request,
  props: { params: Promise<{ id: string }> }
) {
  try {
    // Next 16 makes params a promise, synchronous access was removed.
    const { id } = await props.params;

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("listings")
      .select(
        "id, owner_address, category, title, description, price_per_day, deposit, status, moderation_status, created_at, listing_images(url, sort_order, uploaded_at)"
      )
      .eq("id", id)
      .single();

    if (error || !data) {
      return NextResponse.json({ error: "Listing not found." }, { status: 404 });
    }

    const images = [...(data.listing_images ?? [])].sort(
      (a, b) => a.sort_order - b.sort_order
    );

    return NextResponse.json({ ...data, listing_images: images });
  } catch (error) {
    // Missing configuration and an unreachable database both land here. Say which.
    return errorResponse(error);
  }
}

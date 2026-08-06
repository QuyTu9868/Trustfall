import { NextResponse } from "next/server";
import { cameThroughGateway } from "@/lib/agent-gateway";
import { errorResponse } from "@/lib/api";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { notifyListingVerdict } from "@/lib/notify";

/**
 * The route that puts a listing live, or refuses it, on the checker's say-so.
 *
 * No money moves here, which is exactly why it is worth guarding anyway. This agent decides
 * who gets to trade on the marketplace at all, it can be wrong in both directions, and a
 * refusal an owner cannot appeal is a refusal they walk away from. Same shape as its
 * sibling: a proposal arrives, the server re-reads the row rather than trusting the caller
 * about it, and the decision is recorded either way.
 *
 * The owner's address is read from the listing, never from the request. Otherwise a body
 * could name somebody else and their bell would ring about a listing that was not theirs.
 */
type Proposal = {
  listingId: string;
  decision: string;
  reasons?: string[];
  findings?: { from: string; says: string }[];
  model?: string;
};

export async function POST(request: Request) {
  try {
    const gate = cameThroughGateway(request);
    if (!gate.ok) {
      return NextResponse.json({ error: "Not through the gateway." }, { status: 401 });
    }

    const body = (await request.json()) as Proposal;
    if (body.decision !== "approve" && body.decision !== "reject") {
      return NextResponse.json({ error: `Not a decision: ${body.decision}` }, { status: 400 });
    }

    const reasons = Array.isArray(body.reasons)
      ? body.reasons.filter((r): r is string => typeof r === "string" && r.trim().length > 0)
      : [];

    // A rejection nobody can act on is the failure CLAUDE.md section 9 names by name, so it
    // is refused here rather than stored and shown as a blank complaint.
    if (body.decision === "reject" && reasons.length === 0) {
      return NextResponse.json({ error: "A rejection needs a reason." }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const { data: listing, error: readError } = await supabase
      .from("listings")
      .select("id, owner_address, title")
      .eq("id", body.listingId)
      .maybeSingle();

    if (readError) return NextResponse.json({ error: readError.message }, { status: 500 });
    if (!listing) return NextResponse.json({ error: "No such listing." }, { status: 404 });

    const approved = body.decision === "approve";
    const { error } = await supabase
      .from("listings")
      .update({
        status: approved ? "published" : "draft",
        moderation_status: approved ? "approved" : "rejected",
        // Cleared on approval, so a listing that was rejected and then fixed does not
        // carry the old complaint around forever.
        moderation_reason: approved ? null : reasons.join(" "),
      })
      .eq("id", listing.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Recorded, and never allowed to stop a publish. The opposite call from the dispute
    // route: there a lost record meant money had already moved, here nothing has.
    const { error: logError } = await supabase.from("listing_checks").insert({
      listing_id: listing.id,
      decision: body.decision,
      reasons,
      findings: body.findings ?? [],
      model: body.model ?? "unknown",
    });
    if (logError) console.error("Could not record the listing check:", logError.message);

    await notifyListingVerdict(listing.owner_address, listing.id, listing.title, {
      decision: body.decision,
      reasons,
    });

    return NextResponse.json({ decision: body.decision, guarded: gate.guarded });
  } catch (error) {
    return errorResponse(error);
  }
}

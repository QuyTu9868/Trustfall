import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/api";
import { targetChain } from "@/lib/chain";
import { moderationBypassed, setModerationBypass } from "@/lib/moderation";

/**
 * The switch behind the toggle on /dev.
 *
 * Refuses to exist anywhere but the local Hardhat chain, and checks that here rather than
 * trusting the page not to render the button. A route that is only safe because the UI
 * hides it is reachable with curl.
 *
 * No session needed. On chain 31337 the money is imaginary and the whole /dev page is a
 * developer tool; adding a login to it would only make seeding data slower.
 */
function localOnly() {
  return targetChain.id === 31337;
}

export async function GET() {
  if (!localOnly()) return NextResponse.json({ error: "Not here." }, { status: 404 });
  return NextResponse.json({ bypassed: moderationBypassed() });
}

export async function POST(request: Request) {
  try {
    if (!localOnly()) return NextResponse.json({ error: "Not here." }, { status: 404 });

    const { bypassed } = await request.json();
    setModerationBypass(Boolean(bypassed));
    return NextResponse.json({ bypassed: moderationBypassed() });
  } catch (error) {
    return errorResponse(error);
  }
}

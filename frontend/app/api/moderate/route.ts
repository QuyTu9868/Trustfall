import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/api";
import {
  ModerationUnavailable,
  moderateListing,
  moderationBypassed,
  toDataUrls,
} from "@/lib/moderation";
import { AuthError, readIdentityToken, walletFromIdentityToken } from "@/lib/privy-server";

/**
 * Checks a listing without publishing it.
 *
 * Exists so the owner sees the verdict at step 2, while the draft is still in front of
 * them and fixing it is a matter of editing a box. Finding out at the moment you press
 * publish is how a rejection reads as a wall rather than a note.
 *
 * This is not the check that matters. A browser can skip it. The same function runs
 * inside the publish route, which is where a listing is actually stopped.
 */
export async function POST(request: Request) {
  try {
    // Signed in only. Nothing here writes anything, but it does spend tokens on somebody
    // else's API key, and an open endpoint that costs money is an open endpoint that gets
    // used for something else.
    await walletFromIdentityToken(await readIdentityToken(request));

    const form = await request.formData();
    const title = String(form.get("title") ?? "").trim();
    const description = String(form.get("description") ?? "").trim();
    const images = form.getAll("images").filter((f): f is File => f instanceof File);

    const verdict = await moderateListing({
      title,
      description,
      images: await toDataUrls(images),
    });

    // Says so out loud when the check is off. A screen that reports "checked and clear"
    // while nothing was checked is the one way this switch does real damage.
    return NextResponse.json({ ...verdict, bypassed: moderationBypassed() });
  } catch (error) {
    if (error instanceof AuthError) return errorResponse(error, 401);
    // 503 rather than 500: the listing is fine as far as anyone knows, the checker is not
    // answering. The difference decides whether the owner edits their words or waits.
    if (error instanceof ModerationUnavailable) return errorResponse(error, 503);
    return errorResponse(error);
  }
}

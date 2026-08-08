import { NextResponse, after } from "next/server";
import { errorResponse } from "@/lib/api";
import { AuthError, readIdentityToken, walletFromIdentityToken } from "@/lib/privy-server";
import { RentalError, readRentalAsParty } from "@/lib/rental-server";
import { resolveDispute } from "@/lib/resolve-dispute";
import { readSettlement } from "@/lib/settlement";
import { DISPUTE_EVIDENCE_BUCKET, getSupabaseAdmin } from "@/lib/supabase-server";

const MAX_STATEMENT = 1500;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];

/**
 * How long one side gets to answer before the arbitrator rules without them.
 *
 * Waiting for both is fairer. Waiting forever is a tactic: whoever expects to lose simply
 * never files, and the deposit sits there until the seven day timeout hands it to the
 * renter regardless of what happened.
 */
const REPLY_WINDOW_MS = 24 * 60 * 60 * 1000;

/** What each side has filed, and what the arbitrator made of it. */
export async function GET(request: Request) {
  try {
    const caller = await walletFromIdentityToken(await readIdentityToken(request));
    const rentalId = new URL(request.url).searchParams.get("rentalId");
    const { rental } = await readRentalAsParty(rentalId, caller);
    const supabase = getSupabaseAdmin();

    const [{ data: evidence }, { data: verdict }] = await Promise.all([
      supabase
        .from("dispute_evidence")
        .select("side, statement, image_path, created_at")
        .eq("onchain_rental_id", Number(rental.id))
        .order("created_at"),
      supabase
        .from("dispute_verdicts")
        .select("verdict, confidence, reason, signed, tx_hash, held_back_reason, created_at")
        .eq("onchain_rental_id", Number(rental.id))
        .maybeSingle(),
    ]);

    // Photographs too, not only the words. The arbitrator weighs the pictures most
    // heavily, so a side that cannot see what was filed against them cannot tell whether
    // the ruling was reasonable. Signed links, because the bucket stays private.
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

    // The statements are shown to both sides. Arguing about somebody's deposit behind
    // their back is not a thing this should make easy, and the arbitrator sees both
    // anyway, so hiding one from the other only misleads whoever is reading.
    return NextResponse.json({
      status: rental.status,
      mine: caller === rental.owner ? "owner" : "renter",
      evidence: (evidence ?? []).map(({ image_path, ...rest }) => ({
        ...rest,
        image_url: image_path ? (links.get(image_path) ?? null) : null,
      })),
      verdict: verdict ?? null,
      // The figures the contract emitted, for the two people whose money it was. They are
      // the ones with the strongest claim to see the receipt rather than the summary.
      settled: verdict?.signed && verdict.tx_hash ? await readSettlement(verdict.tx_hash) : null,
    });
  } catch (error) {
    if (error instanceof AuthError) return errorResponse(error, 401);
    if (error instanceof RentalError) return errorResponse(error, error.status);
    return errorResponse(error);
  }
}

/** Tries the arbitrator again, for a dispute whose first attempt did not finish. */
export async function PATCH(request: Request) {
  try {
    const caller = await walletFromIdentityToken(await readIdentityToken(request));
    const { rentalId } = await request.json();
    const { rental } = await readRentalAsParty(rentalId, caller);

    const { data: existing } = await getSupabaseAdmin()
      .from("dispute_verdicts")
      .select("signed")
      .eq("onchain_rental_id", Number(rental.id))
      .maybeSingle();

    // Only when nothing was applied. Re-running a signed verdict cannot change the money,
    // the contract would refuse, but it would spend tokens and rewrite the record of a
    // decision that already stands.
    if (existing?.signed) {
      return NextResponse.json({ error: "This one is already settled." }, { status: 409 });
    }

    return NextResponse.json({ ruling: await resolveDispute(rental.id) });
  } catch (error) {
    if (error instanceof AuthError) return errorResponse(error, 401);
    if (error instanceof RentalError) return errorResponse(error, error.status);
    return errorResponse(error);
  }
}

/**
 * One side files their account of what happened.
 *
 * Which side they are is read off the chain, never taken from the request, so nobody can
 * file as the other party. One submission each, enforced by the database, because letting
 * somebody file twice lets them keep adding material after reading the reply.
 *
 * The arbitrator runs from here rather than from a button. The side expecting to lose
 * would never press it.
 */
export async function POST(request: Request) {
  try {
    const caller = await walletFromIdentityToken(await readIdentityToken(request));
    const form = await request.formData();

    const statement = String(form.get("statement") ?? "").trim();
    const image = form.get("image");
    const hasImage = image instanceof File && image.size > 0;

    if (!statement) {
      return NextResponse.json({ error: "Say what happened." }, { status: 400 });
    }
    if (statement.length > MAX_STATEMENT) {
      return NextResponse.json({ error: "That is too long." }, { status: 400 });
    }
    if (hasImage) {
      if (!IMAGE_TYPES.includes(image.type)) {
        return NextResponse.json({ error: "Photos must be JPG, PNG or WebP." }, { status: 400 });
      }
      if (image.size > MAX_IMAGE_BYTES) {
        return NextResponse.json({ error: "That photo is over 5MB." }, { status: 400 });
      }
    }

    const { rental } = await readRentalAsParty(form.get("rentalId"), caller);
    if (rental.status !== "Disputed") {
      return NextResponse.json(
        { error: `This rental is ${rental.status}, not in dispute.` },
        { status: 409 }
      );
    }

    const side = caller === rental.owner ? "owner" : "renter";
    const supabase = getSupabaseAdmin();

    let path: string | null = null;
    if (hasImage) {
      const extension = image.type.split("/")[1].replace("jpeg", "jpg");
      path = `${rental.id}/${side}.${extension}`;
      const { error } = await supabase.storage
        .from(DISPUTE_EVIDENCE_BUCKET)
        .upload(path, image, { contentType: image.type, upsert: true });
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // created_at is left to the database on purpose. CLAUDE.md section 9: a photo's own
    // EXIF timestamp can be rewritten in seconds, and this timestamp is evidence the
    // arbitrator weighs.
    const { error } = await supabase
      .from("dispute_evidence")
      .insert({ onchain_rental_id: Number(rental.id), side, author_address: caller, statement, image_path: path });

    if (error?.code === "23505") {
      return NextResponse.json({ error: "You already filed on this rental." }, { status: 409 });
    }
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Judged after the answer goes out, for the same reason publishing is. A measured call
    // took sixty four seconds while the model was busy, and the person waiting had already
    // done their part: the statement is saved, and nothing they can do changes what the
    // arbitrator will say. DisputeBox polls every ten seconds and picks the ruling up.
    after(() => maybeArbitrate(rental.id));
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (error) {
    if (error instanceof AuthError) return errorResponse(error, 401);
    if (error instanceof RentalError) return errorResponse(error, error.status);
    return errorResponse(error);
  }
}

/**
 * Rules once both sides have spoken, or once the first has waited long enough.
 *
 * Returns null when it is not time yet, and swallows its own failure: the evidence is
 * already saved, and telling somebody their submission failed because a third party was
 * busy would be a lie about the part that matters.
 */
async function maybeArbitrate(rentalId: bigint) {
  const supabase = getSupabaseAdmin();
  const { data: filed } = await supabase
    .from("dispute_evidence")
    .select("created_at")
    .eq("onchain_rental_id", Number(rentalId))
    .order("created_at");

  if (!filed?.length) return null;

  const bothIn = filed.length >= 2;
  const waitedLongEnough =
    Date.now() - new Date(filed[0].created_at).getTime() >= REPLY_WINDOW_MS;
  if (!bothIn && !waitedLongEnough) return null;

  try {
    return await resolveDispute(rentalId);
  } catch (error) {
    console.error("Arbitration did not complete:", error);
    return null;
  }
}

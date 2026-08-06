import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/api";
import { notifyHandoverPhoto } from "@/lib/notify";
import { readIdentityToken, walletFromIdentityToken } from "@/lib/privy-server";
import { readRentalAsParty } from "@/lib/rental-server";
import { DISPUTE_EVIDENCE_BUCKET, getSupabaseAdmin } from "@/lib/supabase-server";

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_NOTE = 500;
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];

/**
 * The photograph taken when the item changes hands.
 *
 * Two of them per rental, one at each handover, and each taken by whoever is receiving:
 * the renter collects it, the owner gets it back. That pairing is deliberate. A picture
 * taken by the person handing something over shows what they want it to show; a picture
 * taken by the person accepting it is the one they will have to argue against later.
 *
 * The time comes from the database, never from the file. CLAUDE.md section 9 is explicit
 * about it: EXIF is rewritable in seconds and this timestamp is evidence an agent uses to
 * split a deposit.
 *
 * Stored in the dispute evidence bucket rather than one of its own, because it is the same
 * kind of thing under the same rules: private, read through signed links, and read by the
 * arbitrator. A second bucket would be a second thing to create by hand on demo day.
 */
export async function POST(request: Request) {
  try {
    const caller = await walletFromIdentityToken(await readIdentityToken(request));
    const form = await request.formData();

    const phase = String(form.get("phase") ?? "");
    if (phase !== "checkin" && phase !== "checkout") {
      return NextResponse.json({ error: "Unknown handover." }, { status: 400 });
    }

    const image = form.get("image");
    if (!(image instanceof File) || image.size === 0) {
      return NextResponse.json({ error: "No photo." }, { status: 400 });
    }

    // Optional. Most handovers have nothing to say, and demanding a sentence produces "ok"
    // and teaches everybody to skip reading the field.
    const note = String(form.get("note") ?? "").trim();
    if (note.length > MAX_NOTE) {
      return NextResponse.json({ error: "That note is too long." }, { status: 400 });
    }
    if (!IMAGE_TYPES.includes(image.type)) {
      return NextResponse.json({ error: "Photos must be JPG, PNG or WebP." }, { status: 400 });
    }
    if (image.size > MAX_IMAGE_BYTES) {
      return NextResponse.json({ error: "That photo is over 5MB." }, { status: 400 });
    }

    const { rental } = await readRentalAsParty(form.get("rentalId"), caller);

    // Read off the chain, not taken from the request. Whoever received the item is the one
    // who gets to say what it looked like on arrival.
    const receiver = phase === "checkin" ? rental.renter : rental.owner;
    if (caller !== receiver) {
      return NextResponse.json(
        {
          error:
            phase === "checkin"
              ? "The renter photographs the item at check-in."
              : "The owner photographs the item at check-out.",
        },
        { status: 403 }
      );
    }

    // The rental has to have reached the handover being photographed, or the picture is of
    // something that has not happened. Active means check-in is done; anything past that
    // means it has come back.
    const reached =
      phase === "checkin"
        ? ["Active", "Returned", "Disputed", "Completed"].includes(rental.status)
        : ["Returned", "Disputed", "Completed"].includes(rental.status);
    if (!reached) {
      return NextResponse.json(
        { error: `This rental is ${rental.status}. There is nothing to photograph yet.` },
        { status: 409 }
      );
    }

    const supabase = getSupabaseAdmin();
    const extension = image.type.split("/")[1].replace("jpeg", "jpg");
    const path = `handover/${rental.id}/${phase}.${extension}`;

    // upsert on the file and a unique row on the table, which together mean the storage
    // object can be rewritten but the row cannot: the second attempt fails on the
    // constraint before anything has been claimed. Replacing the picture after seeing what
    // the argument turned out to be about is the thing this exists to prevent.
    const { error: uploadError } = await supabase.storage
      .from(DISPUTE_EVIDENCE_BUCKET)
      .upload(path, image, { contentType: image.type, upsert: true });
    if (uploadError) {
      return NextResponse.json({ error: uploadError.message }, { status: 500 });
    }

    const { error } = await supabase.from("handover_photos").insert({
      onchain_rental_id: Number(rental.id),
      phase,
      image_path: path,
      uploaded_by: caller,
      note: note || null,
    });

    if (error?.code === "23505") {
      return NextResponse.json(
        { error: "There is already a photo for this handover." },
        { status: 409 }
      );
    }
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // The other party, worked out from the chain rather than from the request. A photograph
    // nobody is told about is one that gets seen for the first time during an argument.
    const other = caller === rental.owner ? rental.renter : rental.owner;
    await notifyHandoverPhoto(other, rental.id, phase, note || null);

    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}

/** The two photographs, as links the browser can open. */
export async function GET(request: Request) {
  try {
    const caller = await walletFromIdentityToken(await readIdentityToken(request));
    const rentalId = new URL(request.url).searchParams.get("rentalId");
    const { rental } = await readRentalAsParty(rentalId, caller);

    const supabase = getSupabaseAdmin();
    const { data } = await supabase
      .from("handover_photos")
      .select("phase, image_path, note, created_at")
      .eq("onchain_rental_id", Number(rental.id));

    const links = new Map<string, string>();
    if (data?.length) {
      const { data: signed } = await supabase.storage
        .from(DISPUTE_EVIDENCE_BUCKET)
        .createSignedUrls(
          data.map((row) => row.image_path),
          60 * 60
        );
      for (const entry of signed ?? []) {
        if (entry.path && entry.signedUrl) links.set(entry.path, entry.signedUrl);
      }
    }

    return NextResponse.json({
      photos: (data ?? []).map((row) => ({
        phase: row.phase,
        note: row.note,
        created_at: row.created_at,
        image_url: links.get(row.image_path) ?? null,
      })),
    });
  } catch (error) {
    return errorResponse(error);
  }
}

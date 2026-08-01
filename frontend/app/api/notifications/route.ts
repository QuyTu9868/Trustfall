import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/api";
import type { Status } from "@/lib/escrow";
import { type NotificationKind, notify } from "@/lib/notify";
import { AuthError, readIdentityToken, walletFromIdentityToken } from "@/lib/privy-server";
import { RentalError, readRentalAsParty } from "@/lib/rental-server";
import { getSupabaseAdmin } from "@/lib/supabase-server";

/**
 * What each kind claims happened, and who therefore needs telling.
 *
 * The status column is what makes this route trustworthy. A browser says "this rental was
 * approved" and the route goes and asks the contract whether it actually was, refusing
 * the write if not. Without that check anybody could post themselves a notice saying a
 * deposit had been released.
 *
 * The recipient is derived here too, never sent. The person who caused an event does not
 * need telling about it, so who gets the notice follows from the event itself.
 */
const EVENTS: Record<NotificationKind, { requires: Status; to: "owner" | "renter" | "other" }> = {
  requested: { requires: "Requested", to: "owner" },
  approved: { requires: "Approved", to: "renter" },
  cancelled: { requires: "Cancelled", to: "other" },
  "checked-in": { requires: "Active", to: "owner" },
  "checked-out": { requires: "Returned", to: "renter" },
  completed: { requires: "Completed", to: "other" },
};

export async function POST(request: Request) {
  try {
    const caller = await walletFromIdentityToken(await readIdentityToken(request));
    const { rentalId, kind } = await request.json();

    const event = EVENTS[kind as NotificationKind];
    if (!event) {
      return NextResponse.json({ error: "Not a kind you can post." }, { status: 400 });
    }

    const { rental, counterparty } = await readRentalAsParty(rentalId, caller);

    if (rental.status !== event.requires) {
      return NextResponse.json(
        { error: `That has not happened. The rental is ${rental.status}.` },
        { status: 409 }
      );
    }

    const recipient =
      event.to === "owner" ? rental.owner : event.to === "renter" ? rental.renter : counterparty;

    // Telling yourself something you just did is noise, and it happens whenever the same
    // wallet plays both sides while testing.
    if (recipient === caller) return NextResponse.json({ ok: true, skipped: "self" });

    await notify(recipient, kind as NotificationKind, rental);
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (error) {
    if (error instanceof AuthError) return errorResponse(error, 401);
    if (error instanceof RentalError) return errorResponse(error, error.status);
    return errorResponse(error);
  }
}

/** This wallet's inbox, unread first. */
export async function GET(request: Request) {
  try {
    const caller = await walletFromIdentityToken(await readIdentityToken(request));

    const { data, error } = await getSupabaseAdmin()
      .from("notifications")
      .select("id, kind, body, is_read, created_at, onchain_rental_id")
      .eq("recipient_address", caller)
      .order("created_at", { ascending: false })
      .limit(30);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ notifications: data ?? [] });
  } catch (error) {
    if (error instanceof AuthError) return errorResponse(error, 401);
    return errorResponse(error);
  }
}

/** Marks everything in this wallet's inbox as read. */
export async function PATCH(request: Request) {
  try {
    const caller = await walletFromIdentityToken(await readIdentityToken(request));

    const { error } = await getSupabaseAdmin()
      .from("notifications")
      .update({ is_read: true })
      .eq("recipient_address", caller)
      .eq("is_read", false);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof AuthError) return errorResponse(error, 401);
    return errorResponse(error);
  }
}

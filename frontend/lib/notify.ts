import "server-only";
import type { OnChainRental } from "./rental-server";
import { getSupabaseAdmin } from "./supabase-server";

/**
 * Tells one person that something happened on a rental.
 *
 * The wording lives here rather than in the request body on purpose. A client that could
 * choose the text could tell somebody their deposit was released when it was not, which
 * on a page about money is not a cosmetic problem. The caller picks a kind; this file
 * decides what that kind says.
 */
export type NotificationKind =
  | "requested"
  | "approved"
  | "cancelled"
  | "checked-in"
  | "checked-out"
  | "completed";

/**
 * What each kind says.
 *
 * Only things that happened on the chain are in here. New messages used to be, and are
 * not any more: a count next to the conversation says how many and where, which a line in
 * a dropdown never could.
 */
const WORDING: Record<NotificationKind, string> = {
  requested: "Somebody wants to rent your item. Accept or decline it on the rentals page.",
  approved: "Your request was accepted. Scan the owner's code to collect the item.",
  cancelled: "This rental was cancelled.",
  "checked-in": "The item was collected. The rental clock is running.",
  "checked-out": "The item came back. The deposit is released after 3 days.",
  completed: "The rental is finished and the deposit has been returned.",
};

export async function notify(
  recipient: string,
  kind: NotificationKind,
  rental: OnChainRental
) {
  const supabase = getSupabaseAdmin();

  // Upsert rather than insert. This is called from the browser once a transaction
  // confirms, and a refresh or a retry would otherwise leave the same news in the bell
  // several times over. A repeat updates the row and marks it unread again.
  const { error } = await supabase.from("notifications").upsert(
    {
      recipient_address: recipient,
      kind,
      onchain_rental_id: Number(rental.id),
      body: `Rental #${rental.id}. ${WORDING[kind]}`,
      is_read: false,
      created_at: new Date().toISOString(),
    },
    { onConflict: "recipient_address,kind,onchain_rental_id" }
  );
  if (error) console.error("Could not write the notification:", error.message);
}

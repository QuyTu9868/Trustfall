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

/**
 * Tells an owner what happened to a listing they submitted.
 *
 * Separate from the rental notifications above because the two are keyed on different
 * things and carry different news. This one exists at all because a listing is now saved
 * before it is checked, so the verdict can land after the page that asked for it has been
 * refreshed away.
 *
 * The reason is the message. CLAUDE.md section 9 is explicit that a rejection which only
 * says "rejected" loses the owner, and that is doubly true in a bell where there is no
 * form underneath to explain it.
 */
/**
 * The check never finished, so there is no verdict to deliver, only the fact of it.
 *
 * Worth its own notification. The listing sits at pending, which looks identical to still
 * being checked, and without this the owner waits for a bell that is never going to ring.
 */
export async function notifyListingCheckFailed(owner: string, listingId: string, title: string) {
  const { error } = await getSupabaseAdmin().from("notifications").upsert(
    {
      recipient_address: owner,
      kind: "listing-check-failed",
      listing_id: listingId,
      body: `"${title}" could not be checked just now. Open it and submit again.`,
      is_read: false,
      created_at: new Date().toISOString(),
    },
    { onConflict: "recipient_address,kind,listing_id" }
  );
  if (error) console.error("Could not write the listing notification:", error.message);
}

export async function notifyListingVerdict(
  owner: string,
  listingId: string,
  title: string,
  verdict: { decision: "approve" | "reject"; reasons: string[] }
) {
  const approved = verdict.decision === "approve";
  const body = approved
    ? `"${title}" passed the check and is live.`
    : `"${title}" was not accepted. ${verdict.reasons.join(" ")}`;

  const { error } = await getSupabaseAdmin().from("notifications").upsert(
    {
      recipient_address: owner,
      kind: approved ? "listing-approved" : "listing-rejected",
      listing_id: listingId,
      body,
      is_read: false,
      created_at: new Date().toISOString(),
    },
    { onConflict: "recipient_address,kind,listing_id" }
  );
  if (error) console.error("Could not write the listing notification:", error.message);
}

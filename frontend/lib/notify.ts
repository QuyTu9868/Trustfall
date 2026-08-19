import "server-only";
import type { OnChainRental } from "./rental-server";
import { getSupabaseAdmin } from "./supabase-server";

/**
 * Writes one notification, once.
 *
 * Insert, not upsert, and that is the whole reason this function exists.
 *
 * Every one of these used to call .upsert() with onConflict naming the columns of the
 * unique index. Both indexes are PARTIAL: `where onchain_rental_id is not null`, so that
 * rows about a listing, which have a null rental id, do not all collide with each other.
 * Postgres will not infer a partial index from a bare ON CONFLICT (cols); the statement has
 * to repeat the index predicate, and the Supabase client has no way to send one. So every
 * write returned "there is no unique or exclusion constraint matching the ON CONFLICT
 * specification", and every caller logged that to a console nobody reads and carried on.
 *
 * The table had zero rows in it. The bell had never once rung, for any event, since it was
 * built. Nothing in the app said so, because an empty inbox looks exactly like an inbox
 * with nothing in it.
 *
 * 23505 is the unique index doing its job: this person has already been told this thing
 * about this rental. That is a success, not a failure, and the reason upsert was reached
 * for in the first place was only to re-mark such a row unread, which is not worth a
 * mechanism that does not work.
 */
async function write(row: Record<string, unknown>, what: string) {
  const { error } = await getSupabaseAdmin().from("notifications").insert(row);
  if (error && error.code !== "23505") {
    console.error(`Could not write the ${what} notification:`, error.message);
  }
  return !error;
}

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
  | "completed"
  | "disputed"
  | "dispute-filed"
  | "appealed"
  | "reviewed";

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
  // The deadline is the message. Somebody who reads this a day late has already lost the
  // chance to answer, and the arbitrator will have ruled on one account of what happened.
  disputed:
    "The other side has opened a dispute. File your account within a day, or the arbitrator rules on theirs alone.",
  "dispute-filed":
    "The other side has filed their account. Yours goes to the arbitrator with it, and it rules once both are in.",
  appealed:
    "The other side has appealed the ruling. If the deposit has not moved, the arbitrator reads the dispute again.",
  reviewed: "Somebody left you a review for this rental.",
};

export async function notify(
  recipient: string,
  kind: NotificationKind,
  rental: OnChainRental
) {
  await write(
    {
      recipient_address: recipient,
      kind,
      onchain_rental_id: Number(rental.id),
      body: `Rental #${rental.id}. ${WORDING[kind]}`,
      is_read: false,
      created_at: new Date().toISOString(),
    },
    kind
  );
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
/**
 * Tells the other side that a handover photograph has arrived.
 *
 * Its own function rather than a NotificationKind, because the two phases need two kinds:
 * the unique index is (recipient, kind, rental), so one shared kind would let the check-out
 * photograph silently overwrite the notification about the check-in one.
 *
 * The note goes in the body when there is one. A photograph nobody is told about is a
 * photograph that gets seen for the first time during an argument, which is late.
 */
export async function notifyHandoverPhoto(
  recipient: string,
  rentalId: bigint,
  phase: "checkin" | "checkout",
  note: string | null
) {
  const when = phase === "checkin" ? "collected" : "came back";
  const body = note
    ? `A photograph of the item as it ${when}, with a note: "${note}"`
    : `A photograph of the item as it ${when}.`;

  await write(
    {
      recipient_address: recipient,
      kind: `handover-${phase}`,
      onchain_rental_id: Number(rentalId),
      body,
      is_read: false,
      created_at: new Date().toISOString(),
    },
    "handover"
  );
}

/** What each outcome did to the deposit, in the words somebody losing would read. */
const OUTCOME: Record<"refund_renter" | "split" | "pay_owner", string> = {
  refund_renter: "the whole deposit goes back to the renter",
  split: "the deposit is split down the middle",
  pay_owner: "the owner keeps the deposit",
};

/**
 * Tells both sides how their dispute ended, or that it has not.
 *
 * Its own function because the body carries the outcome, and because this is the one
 * notification in the app that nobody's browser can send. The arbitrator runs on the
 * server, minutes after the last person touched the page, and often while neither party
 * has the app open at all. Without this the ruling is a thing you find by going to look.
 *
 * Both parties, not just the loser. Somebody who won still has to know the money moved,
 * and telling only one side would make the bell a signal that you lost.
 *
 * A held back ruling is the more important of the two to send. Nothing moved, the deposit
 * is still sitting in the contract, and there is something the reader can actually do
 * about it. That is the state most worth interrupting somebody for.
 */
export async function notifyRuling(
  parties: string[],
  rentalId: bigint,
  ruling: {
    verdict: "refund_renter" | "split" | "pay_owner";
    signed: boolean;
    heldBack: string | null;
    /** Who chose the word. A person only ever decides one the arbitrator could not. */
    by?: "arbitrator" | "admin";
  }
) {
  // Named, because the two are not interchangeable to somebody whose deposit it was. A
  // human decision delivered under the model's name would be the app misreporting the one
  // fact this whole design is about.
  const who = ruling.by === "admin" ? "A person" : "The arbitrator";

  const body = ruling.signed
    ? `Rental #${rentalId}. ${who} decided: ${OUTCOME[ruling.verdict]}. The contract has moved it.`
    : `Rental #${rentalId}. The arbitrator ruled, and the server did not act on it. ${
        ruling.heldBack ?? ""
      } Nothing has moved. You can appeal with something it did not have, and seven days after the dispute opened anyone can close it, which returns the deposit to the renter.`.trim();

  for (const recipient of new Set(parties.map((p) => p.toLowerCase()))) {
    await write(
      {
        recipient_address: recipient,
        // Two kinds, not one: the unique index is (recipient, kind, rental), so a ruling
        // that was held back and later applied would otherwise be refused as a duplicate
        // and the second, truer piece of news would never arrive.
        kind: ruling.signed ? "dispute-resolved" : "dispute-held",
        onchain_rental_id: Number(rentalId),
        body,
        is_read: false,
        created_at: new Date().toISOString(),
      },
      "ruling"
    );
  }
}

export async function notifyListingCheckFailed(owner: string, listingId: string, title: string) {
  await write(
    {
      recipient_address: owner,
      kind: "listing-check-failed",
      listing_id: listingId,
      body: `"${title}" could not be checked just now. Open it and submit again.`,
      is_read: false,
      created_at: new Date().toISOString(),
    },
    "listing check"
  );
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

  await write(
    {
      recipient_address: owner,
      kind: approved ? "listing-approved" : "listing-rejected",
      listing_id: listingId,
      body,
      is_read: false,
      created_at: new Date().toISOString(),
    },
    "listing verdict"
  );
}

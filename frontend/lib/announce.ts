"use client";

/**
 * Tells the server an on-chain event happened, so the other party hears about it.
 *
 * Called after a transaction is mined, never before. The server does not take our word
 * for it: it reads the rental back from the chain and refuses the notification if the
 * status does not match the event being claimed.
 *
 * Known limit, and it is a real one: this runs in the browser that sent the transaction.
 * Close the tab between the wallet confirming and this call, and the notification is
 * simply never written. The chain is still right, only the bell misses it. Doing better
 * means an indexer listening for events, which CLAUDE.md section 7 parks as a production
 * concern rather than a demo one.
 */
export type Announcement =
  | "requested"
  | "approved"
  | "cancelled"
  | "checked-in"
  | "checked-out"
  | "completed"
  | "disputed";

export async function announce(rentalId: bigint, kind: Announcement, identityToken?: string) {
  try {
    await fetch("/api/notifications", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(identityToken ? { "privy-id-token": identityToken } : {}),
      },
      body: JSON.stringify({ rentalId: rentalId.toString(), kind }),
    });
  } catch {
    // Deliberately swallowed. The money moved; a missing notification must not be shown
    // to the user as though the transaction had failed.
  }
}

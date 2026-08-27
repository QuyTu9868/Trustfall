import { ChatThread } from "@/components/chat-thread";
import { ReviewBox } from "@/components/review-box";
import { UnreadBadge } from "@/components/unread-badge";
import type { Status } from "@/lib/escrow";

/**
 * Reviews and messages, the two things on a rental that are a conversation rather than a
 * state change. Kept apart from the renting side of the card on purpose: that side is the
 * chain's account of what happened, this side is the two people talking about it.
 *
 * Review sits above chat and, being conditional on Completed, pushes chat down the column
 * once it appears rather than the two swapping places or overlapping.
 */
export function RentalSidebar({
  rentalId,
  status,
  counterparty,
  role,
  unreadCount,
}: {
  rentalId: bigint;
  status: Status;
  counterparty: `0x${string}`;
  role: "owner" | "renter";
  unreadCount: number;
}) {
  return (
    <div className="flex flex-col gap-4">
      {status === "Completed" && (
        <ReviewBox rentalId={rentalId} counterparty={counterparty} role={role} />
      )}

      <section className="flex flex-col gap-3 rounded-card border border-line bg-canvas p-4">
        <h3 className="flex items-center gap-2 text-sm">
          Messages
          <UnreadBadge count={unreadCount} />
        </h3>
        <ChatThread rentalId={rentalId} />
      </section>
    </div>
  );
}

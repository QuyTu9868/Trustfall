"use client";

import { useIdentityToken } from "@privy-io/react-auth";
import Link from "next/link";
import { useState } from "react";
import { formatUnits } from "viem";
import { useAccount, useConfig } from "wagmi";
import { waitForTransactionReceipt, writeContract } from "wagmi/actions";
import { ChatThread } from "@/components/chat-thread";
import { DepositCountdown } from "@/components/deposit-countdown";
import { DisputeBox } from "@/components/dispute-box";
import { HandoverPhoto } from "@/components/handover-photo";
import { ShowHandoverCode } from "@/components/handover-code";
import { ReviewBox } from "@/components/review-box";
import { RoleTag } from "@/components/role-tag";
import { ScanHandover } from "@/components/scan-handover";
import { StatusStrip } from "@/components/status-strip";
import { UnreadBadge } from "@/components/unread-badge";
import { announce } from "@/lib/announce";
import { targetChain } from "@/lib/chain";
import {
  USDC_DECIMALS,
  bytes32ToListingId,
  escrowAbi,
  escrowAddress,
  type Rental,
  type Status,
} from "@/lib/escrow";
import { useNetworkReady } from "@/lib/use-network-ready";
import { useSecondsLeft } from "@/lib/use-seconds-left";
import { useSettlement } from "@/lib/use-settlement";
import { useUnread } from "@/lib/use-unread";

/** What each button means to the other side, once its transaction has landed. */
const TOLD = {
  approveRental: "approved",
  cancel: "cancelled",
  finalize: "completed",
  openDispute: "disputed",
} as const;

/** Mirrors RentalEscrow.DISPUTE_WINDOW. */
const DISPUTE_WINDOW = 3n * 24n * 60n * 60n;

function money(value: bigint) {
  return Number(formatUnits(value, USDC_DECIMALS)).toFixed(2);
}

function day(seconds: bigint) {
  return new Date(Number(seconds) * 1000).toISOString().slice(0, 10);
}

/**
 * One rental, showing only the moves available to whoever is looking.
 *
 * The pairing is deliberate and matches the contract. At check-in the owner shows a code
 * and the renter submits it, so an owner cannot take the rent without handing the item
 * over. At check-out it reverses: the renter shows, the owner submits, so nobody is
 * marked as having returned something they still have.
 */
export function RentalCard({
  rental,
  onChanged,
}: {
  rental: Rental;
  onChanged: () => void;
}) {
  const config = useConfig();
  const { address } = useAccount();
  const { identityToken } = useIdentityToken();
  const unread = useUnread();
  const { ensureReady } = useNetworkReady();
  // Which panel is open, and which status it was opened for. Tying the two together is
  // what closes it: after a check-out lands the rental becomes Returned, and a panel that
  // survived that was still offering a handover code, recomputed as a check-in code for a
  // rental that had already come back.
  const [panel, setPanel] = useState<{
    kind: "show" | "scan";
    at: Status;
  } | null>(null);
  const openPanel = panel?.at === rental.status ? panel.kind : null;
  const [chatOpen, setChatOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const me = address?.toLowerCase();
  const isOwner = me === rental.owner.toLowerCase();
  const isRenter = me === rental.renter.toLowerCase();

  const settled = rental.status === "Returned" || rental.status === "Completed";
  const settlement = useSettlement(rental.id, settled);

  // What the escrow is holding at this moment, mirroring RentalEscrow rather than the
  // amounts the rental was set up with. Rent is settled on the way out of Active, by
  // checkOut, by openDispute from Active, or by finalize. The deposit survives one state
  // longer and leaves on the verdict or on finalize. Completed and Cancelled hold nothing.
  const holdsRent =
    rental.status === "Requested" ||
    rental.status === "Approved" ||
    rental.status === "Active";
  const holdsDeposit =
    holdsRent || rental.status === "Returned" || rental.status === "Disputed";

  // From Returned the clock runs from the confirmed return. From Active nobody confirmed
  // anything, so it runs from the day the booking ended.
  const releaseAt =
    rental.status === "Returned"
      ? rental.returnedAt + DISPUTE_WINDOW
      : rental.endDate + DISPUTE_WINDOW;
  const canRelease = useSecondsLeft(releaseAt) === 0;

  async function send(
    fn: "approveRental" | "cancel" | "finalize" | "openDispute",
    label: string,
  ) {
    setError(null);
    if (!escrowAddress || !(await ensureReady())) return;
    setBusy(label);
    try {
      const hash = await writeContract(config, {
        address: escrowAddress,
        abi: escrowAbi,
        functionName: fn,
        chainId: targetChain.id,
        args: [rental.id],
      });
      await waitForTransactionReceipt(config, {
        hash,
        chainId: targetChain.id,
      });
      // After the receipt, so the server sees the status the notification claims.
      //
      // Opening a dispute used to be left out of this, on the reasoning that the other
      // side would find the box when they next opened the rental. They have a day to
      // answer before the arbitrator rules on one account alone, and "when they next
      // open it" is not a guarantee that fits inside a day.
      await announce(rental.id, TOLD[fn], identityToken ?? undefined);
      onChanged();
    } catch (cause) {
      const err = cause as { name?: string; shortMessage?: string };
      setError(
        err.name === "UserRejectedRequestError"
          ? "You cancelled it."
          : (err.shortMessage ?? "That did not go through."),
      );
    } finally {
      setBusy(null);
    }
  }

  return (
    <article className="flex flex-col gap-4 rounded-card border border-line bg-surface p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col items-start gap-2">
          <RoleTag owner={isOwner} />
          <span className="text-xs text-ink-muted">
            Rental <span className="tabular">#{rental.id.toString()}</span>
          </span>
          <span className="tabular text-sm">
            {day(rental.startDate)} to {day(rental.endDate)}
          </span>
        </div>
        {/* "held" only while the contract is actually holding it.

            Rent leaves escrow the moment a rental stops being Active: at check-out, or at
            the dispute if one is opened first. So from Returned onwards this line was
            naming money the contract had already paid out, and on a Completed rental it
            claimed to be holding everything while the breakdown directly underneath said
            what had really been charged and refunded. The deposit outlasts it by one
            state, and goes on the same rule. */}
        <div className="text-right text-sm">
          <div className="tabular">
            {money(rental.rent)} USDC {holdsRent ? "held" : "rent"}
          </div>
          <div className="tabular text-xs text-ink-muted">
            {money(rental.deposit)} USDC deposit{holdsDeposit ? ", held" : ""}
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
        <div className="flex flex-col gap-4">
          <StatusStrip status={rental.status} />

          {/* What the rental actually cost, straight from the RentSettled event. */}
          {settlement && (
            <dl className="flex flex-col gap-1.5 rounded-card border border-line bg-canvas p-4 text-sm">
              <Row label="Rent charged">{money(settlement.charged)}</Row>
              <Row label="To the owner">{money(settlement.toOwner)}</Row>
              <Row label="Platform fee, 1%">{money(settlement.fee)}</Row>
              {settlement.refundedToRenter > 0n && (
                <Row label="Refunded to the renter, days not used" highlight>
                  {money(settlement.refundedToRenter)}
                </Row>
              )}
            </dl>
          )}

          {rental.status === "Returned" && (
            <DepositCountdown releaseAt={releaseAt} />
          )}

          <div className="flex flex-wrap items-center gap-2">
            {/* The only way back to the item from a finished rental. The card knows which
                listing it was for and never said so, which left somebody who wanted the
                same thing again searching for it by name.

                No dates on the link, deliberately. Carrying the old ones forward would fill
                the form with a range that has already passed, and the picker's minimum is
                the chain's today, so the first thing it would do is reject itself. */}
            {isRenter && rental.status === "Completed" && (
              <Link
                href={`/listings/${bytes32ToListingId(rental.listingId)}`}
                className="rounded-control border border-line px-3 py-2 text-sm"
              >
                Rent it again
              </Link>
            )}

            {isOwner && rental.status === "Requested" && (
              <>
                <Action
                  onClick={() => send("approveRental", "approve")}
                  busy={busy === "approve"}
                >
                  Accept
                </Action>
                <Secondary
                  onClick={() => send("cancel", "reject")}
                  busy={busy === "reject"}
                >
                  Decline
                </Secondary>
              </>
            )}

            {isRenter && rental.status === "Requested" && (
              <Secondary
                onClick={() => send("cancel", "cancel")}
                busy={busy === "cancel"}
              >
                Cancel, full refund
              </Secondary>
            )}

            {isOwner && rental.status === "Approved" && (
              <>
                <Action
                  onClick={() => setPanel({ kind: "show", at: rental.status })}
                >
                  Show the check-in code
                </Action>
                <Secondary
                  onClick={() => send("cancel", "cancel")}
                  busy={busy === "cancel"}
                >
                  Cancel
                </Secondary>
              </>
            )}

            {isRenter && rental.status === "Approved" && (
              <>
                <Action
                  onClick={() => setPanel({ kind: "scan", at: rental.status })}
                >
                  Scan to collect
                </Action>
                {/* Says the cost out loud. Ten percent is a number people should see before
                they press, not discover on the receipt. */}
                <Secondary
                  onClick={() => send("cancel", "cancel")}
                  busy={busy === "cancel"}
                >
                  Cancel, 10% of rent to the owner
                </Secondary>
              </>
            )}

            {/* Check-out reverses the roles: the renter offers the item back, the owner is
            the one who confirms having received it. */}
            {isRenter && rental.status === "Active" && (
              <Action
                onClick={() => setPanel({ kind: "show", at: rental.status })}
              >
                Show the return code
              </Action>
            )}
            {/* The owner sends this transaction, but the renter has to sign the code first,
                so a label reading like a unilateral action was a promise the contract will
                not keep: pressed without a code, it reverts on a missing signature. */}
            {isOwner && rental.status === "Active" && (
              <Action
                onClick={() => setPanel({ kind: "scan", at: rental.status })}
              >
                Scan the renter&apos;s return code
              </Action>
            )}

            <Secondary onClick={() => setChatOpen((open) => !open)}>
              <span className="flex items-center gap-1.5">
                {chatOpen ? "Hide messages" : "Messages"}
                {!chatOpen && (
                  <UnreadBadge
                    count={unread.counts[rental.id.toString()] ?? 0}
                  />
                )}
              </span>
            </Secondary>

            {/* Only while the money is still there to argue over. The contract refuses
                from any other status, and a button that always reverts is worse than no
                button. Either side can press it: the owner claiming damage and the renter
                claiming the deposit is being kept unfairly are the same mechanism. */}
            {(rental.status === "Active" || rental.status === "Returned") && (
              <Secondary
                onClick={() => send("openDispute", "dispute")}
                busy={busy === "dispute"}
              >
                Something is wrong
              </Secondary>
            )}

            {rental.status === "Returned" && (
              <Action
                onClick={() => send("finalize", "finalize")}
                busy={busy === "finalize"}
                disabled={!canRelease}
              >
                {canRelease ? "Release the deposit" : "Deposit is still held"}
              </Action>
            )}
          </div>

          {rental.status === "Active" && (
            <p className="text-xs text-ink-muted">
              Collected{" "}
              {new Date(Number(rental.checkedInAt) * 1000).toLocaleString()}. A
              day is 24 hours from then, and the rent is worked out when it
              comes back.
            </p>
          )}
        </div>

        {rental.status === "Completed" && (
          <ReviewBox
            rentalId={rental.id}
            counterparty={isOwner ? rental.renter : rental.owner}
            role={isOwner ? "owner" : "renter"}
          />
        )}
      </div>

      {openPanel === "show" && (
        <ShowHandoverCode
          rentalId={rental.id}
          action={rental.status === "Active" ? "checkOut" : "checkIn"}
          onClose={() => setPanel(null)}
        />
      )}
      {openPanel === "scan" && (
        <ScanHandover
          action={rental.status === "Active" ? "checkOut" : "checkIn"}
          onClose={() => setPanel(null)}
          onDone={() => {
            setPanel(null);
            onChanged();
          }}
        />
      )}

      {/* Check-in first and then check-out, in the order they happened. Whoever received
          the item is the one who can add it, and both sides can see either once it is
          there. Shown from Active onwards, because before that nothing has changed hands. */}
      {rental.status !== "Requested" && rental.status !== "Approved" && (
        <HandoverPhoto rentalId={rental.id} phase="checkin" canUpload={isRenter} />
      )}
      {(rental.status === "Returned" ||
        rental.status === "Disputed" ||
        rental.status === "Completed") && (
        <HandoverPhoto rentalId={rental.id} phase="checkout" canUpload={isOwner} />
      )}

      {/* Stays after the dispute is resolved, not only while it is open. resolveDispute
          moves status straight to Completed, and disputedAt is the only thing on the
          rental that still says a dispute happened, so both sides keep seeing the
          ruling and where the deposit went rather than losing it the moment status
          changes. */}
      {(rental.status === "Disputed" || rental.disputedAt > 0n) && (
        <DisputeBox rentalId={rental.id} />
      )}

      {chatOpen && <ChatThread rentalId={rental.id} />}

      {error && <p className="text-xs text-stop-ink">{error}</p>}
    </article>
  );
}

function Row({
  label,
  children,
  highlight,
}: {
  label: string;
  children: React.ReactNode;
  highlight?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className={highlight ? "text-live-ink" : "text-ink-muted"}>
        {label}
      </dt>
      <dd className={highlight ? "text-live-ink" : undefined}>
        <span className="tabular">{children}</span> USDC
      </dd>
    </div>
  );
}

function Action({
  onClick,
  busy,
  disabled,
  children,
}: {
  onClick: () => void;
  busy?: boolean;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={busy || disabled}
      className="rounded-control bg-ink-strong px-4 py-2 text-sm text-canvas active:scale-[0.98] disabled:opacity-40"
    >
      {busy ? "Confirm in your wallet..." : children}
    </button>
  );
}

function Secondary({
  onClick,
  busy,
  children,
}: {
  onClick: () => void;
  busy?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={busy}
      className="rounded-control border border-line px-3 py-2 text-sm disabled:opacity-50"
    >
      {busy ? "Confirm in your wallet..." : children}
    </button>
  );
}

"use client";

import { useIdentityToken } from "@privy-io/react-auth";
import { useState } from "react";
import { formatUnits } from "viem";
import { useAccount, useConfig } from "wagmi";
import { waitForTransactionReceipt, writeContract } from "wagmi/actions";
import { ChatThread } from "@/components/chat-thread";
import { DepositCountdown } from "@/components/deposit-countdown";
import { DisputeBox } from "@/components/dispute-box";
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
      // After the receipt, so the server sees the status the notification claims. Opening
      // a dispute has no notice of its own: the other side finds out from the box that
      // appears on the rental, which is also the only place they can answer it.
      if (fn !== "openDispute") {
        await announce(rental.id, TOLD[fn], identityToken ?? undefined);
      }
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
        <div className="text-right text-sm">
          <div className="tabular">{money(rental.rent)} USDC held</div>
          <div className="tabular text-xs text-ink-muted">
            {money(rental.deposit)} USDC deposit
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
            {isOwner && rental.status === "Active" && (
              <Action
                onClick={() => setPanel({ kind: "scan", at: rental.status })}
              >
                Scan to take it back
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

      {rental.status === "Disputed" && <DisputeBox rentalId={rental.id} />}

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

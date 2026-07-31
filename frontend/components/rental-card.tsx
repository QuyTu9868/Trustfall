"use client";

import { useState } from "react";
import { formatUnits } from "viem";
import { useAccount, useConfig } from "wagmi";
import { waitForTransactionReceipt, writeContract } from "wagmi/actions";
import { ShowHandoverCode } from "@/components/handover-code";
import { ScanHandover } from "@/components/scan-handover";
import { StatusStrip } from "@/components/status-strip";
import { targetChain } from "@/lib/chain";
import { USDC_DECIMALS, escrowAbi, escrowAddress, type Rental } from "@/lib/escrow";
import { useNetworkReady } from "@/lib/use-network-ready";

function money(value: bigint) {
  return Number(formatUnits(value, USDC_DECIMALS)).toFixed(2);
}

function day(seconds: bigint) {
  return new Date(Number(seconds) * 1000).toISOString().slice(0, 10);
}

/**
 * One rental, with only the moves that are actually available to whoever is looking.
 *
 * The pairing is deliberate and matches the contract: at check-in the owner shows a code
 * and the renter submits it, so an owner cannot take the rent without handing the item
 * over. Showing both sides of every action to everybody would hide that.
 */
export function RentalCard({ rental, onChanged }: { rental: Rental; onChanged: () => void }) {
  const config = useConfig();
  const { address } = useAccount();
  const { ensureReady } = useNetworkReady();
  const [panel, setPanel] = useState<"none" | "show" | "scan">("none");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const me = address?.toLowerCase();
  const isOwner = me === rental.owner.toLowerCase();
  const isRenter = me === rental.renter.toLowerCase();

  async function send(fn: "approveRental" | "cancel", label: string) {
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
      await waitForTransactionReceipt(config, { hash, chainId: targetChain.id });
      onChanged();
    } catch (cause) {
      const err = cause as { name?: string; shortMessage?: string };
      setError(
        err.name === "UserRejectedRequestError"
          ? "You cancelled it."
          : (err.shortMessage ?? "That did not go through.")
      );
    } finally {
      setBusy(null);
    }
  }

  return (
    <article className="flex flex-col gap-4 rounded-card border border-line bg-surface p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <span className="text-xs text-ink-muted">
            Rental <span className="tabular">#{rental.id.toString()}</span> ·{" "}
            {isOwner ? "you own this" : "you are renting"}
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

      <StatusStrip status={rental.status} />

      <div className="flex flex-wrap items-center gap-2">
        {isOwner && rental.status === "Requested" && (
          <>
            <Action onClick={() => send("approveRental", "approve")} busy={busy === "approve"}>
              Accept
            </Action>
            <Secondary onClick={() => send("cancel", "reject")} busy={busy === "reject"}>
              Decline
            </Secondary>
          </>
        )}

        {isRenter && rental.status === "Requested" && (
          <Secondary onClick={() => send("cancel", "cancel")} busy={busy === "cancel"}>
            Cancel, full refund
          </Secondary>
        )}

        {isOwner && rental.status === "Approved" && (
          <>
            <Action onClick={() => setPanel("show")}>Show the check-in code</Action>
            <Secondary onClick={() => send("cancel", "cancel")} busy={busy === "cancel"}>
              Cancel
            </Secondary>
          </>
        )}

        {isRenter && rental.status === "Approved" && (
          <>
            <Action onClick={() => setPanel("scan")}>Scan to collect</Action>
            {/* Says the cost out loud. Ten percent is a number people should see before
                they press, not discover on the receipt. */}
            <Secondary onClick={() => send("cancel", "cancel")} busy={busy === "cancel"}>
              Cancel, 10% of rent to the owner
            </Secondary>
          </>
        )}

        {rental.status === "Active" && (
          <span className="text-xs text-ink-muted">
            Collected{" "}
            {new Date(Number(rental.checkedInAt) * 1000).toLocaleString()}. Returning it
            arrives in checkpoint 7.
          </span>
        )}
      </div>

      {panel === "show" && (
        <ShowHandoverCode
          rentalId={rental.id}
          action="checkIn"
          onClose={() => setPanel("none")}
        />
      )}
      {panel === "scan" && (
        <ScanHandover
          action="checkIn"
          onClose={() => setPanel("none")}
          onDone={() => {
            setPanel("none");
            onChanged();
          }}
        />
      )}

      {error && <p className="text-xs text-stop-ink">{error}</p>}
    </article>
  );
}

function Action({
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
      className="rounded-control bg-ink-strong px-4 py-2 text-sm text-white active:scale-[0.98] disabled:opacity-50"
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

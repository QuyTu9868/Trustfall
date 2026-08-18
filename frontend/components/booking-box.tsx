"use client";

import { useRouter } from "next/navigation";
import { useChainToday } from "@/lib/use-chain-clock";
import { useState } from "react";
import { parseUnits } from "viem";
import { usePrivy } from "@privy-io/react-auth";
import {
  USDC_DECIMALS,
  isoDateToTimestamp,
  listingIdToBytes32,
} from "@/lib/escrow";
import { dayLabel, toRanges, useBookedDays } from "@/lib/use-booked-days";
import { useRequestRental } from "@/lib/use-request-rental";

const MAX_RENTAL_DAYS = 30; // mirrors RentalEscrow.MAX_RENTAL_DAYS
const FEE_BPS = 100; // mirrors RentalEscrow.FEE_BPS, 1%

function toUtcDay(value: string) {
  const [y, m, d] = value.split("-").map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / 86_400_000);
}

function money(value: number) {
  return value.toFixed(2);
}

/** The day after an ISO date, for the earliest allowed return date. */
function nextDay(value: string) {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
}

/**
 * Price, dates, and what the money actually does.
 *
 * UI-REFERENCE.md section 6 is explicit that Airbnb hiding the total until the last step
 * is the thing not to copy. Being able to see where the money goes is the reason this
 * project exists, so the whole breakdown sits here in the open.
 *
 * The numbers follow RentalEscrow exactly, and one of them is easy to get wrong: the 1%
 * platform fee is NOT added to what the renter pays. requestRental pulls rent + deposit
 * and nothing more; the fee comes out of the owner's side at check-in. Showing it as a
 * charge on top would overstate the price by 1% and be a lie about the contract.
 */
export function BookingBox({
  listingId,
  owner,
  pricePerDay,
  deposit,
  initialStart = "",
  initialEnd = "",
}: {
  listingId: string;
  owner: string;
  pricePerDay: number;
  deposit: number;
  initialStart?: string;
  initialEnd?: string;
}) {
  const router = useRouter();
  const { authenticated, login, user } = usePrivy();
  const { request, step, error, busy } = useRequestRental();
  const chainToday = useChainToday();
  // Seeded from ?from= and ?to= so a set of dates can be linked to. Checkpoint 6 needs
  // that to send somebody a specific booking, and it also makes this panel, the one
  // screen where the money is spelled out, something that can be checked from a URL
  // rather than only by clicking two date pickers.
  const [start, setStart] = useState(initialStart);
  const [end, setEnd] = useState(initialEnd);

  // Nights, matching RentalEscrow.dayCount exactly. The end date is the day the item
  // comes back, so it is not itself charged: collect on the 30th, return on the 31st,
  // pay for one day. Counting both ends here while the contract counts nights would put
  // a different number on screen than the one the wallet is asked to sign.
  const days = start && end ? toUtcDay(end) - toUtcDay(start) : null;
  const invalidRange = days !== null && days < 1;
  const tooLong = days !== null && days > MAX_RENTAL_DAYS;

  // Which days the contract has already given to somebody else. Checked here so a clash
  // is a sentence on the screen rather than a reverted transaction, which arrives after
  // the wallet popup and reads as DayNotAvailable(19604, 6) to somebody who did nothing
  // wrong. The contract still refuses it either way; this only moves the news earlier.
  const taken = useBookedDays(listingId, chainToday ? toUtcDay(chainToday) : null);
  const ranges = toRanges(taken);

  // The end day is excluded on purpose, matching _bookDays: it is the day the item comes
  // back, and the next rental is allowed to start on it.
  const clash =
    start && end && days !== null && days > 0
      ? Array.from({ length: days }, (_, index) => toUtcDay(start) + index).find((day) =>
          taken.has(day)
        )
      : undefined;

  // What the booked range buys is an allowance, not a bill. The escrow holds this much,
  // and the final charge is worked out from the clock when the item comes back: a rental
  // day is 24 hours from check-in, and unused days are refunded.
  const maxRent = days && days > 0 ? pricePerDay * days : 0;
  const fee = (maxRent * FEE_BPS) / 10_000;
  const payNow = maxRent + deposit;

  const ownsIt =
    authenticated &&
    user?.wallet?.address?.toLowerCase() === owner.toLowerCase();
  const canSubmit = Boolean(
    start && end && days && days > 0 && !tooLong && !ownsIt && clash === undefined
  );

  const label = !authenticated
    ? "Sign in to rent"
    : ownsIt
      ? "This is your own listing"
      : step === "signing"
        ? "Approve in your wallet..."
        : step === "sending"
          ? "Confirm the request..."
          : step === "confirming"
            ? "Waiting for the chain..."
            : "Request to rent";

  async function submit() {
    if (!authenticated) {
      login();
      return;
    }
    if (!days || days < 1) return;

    const id = await request({
      listingId: listingIdToBytes32(listingId),
      owner: owner as `0x${string}`,
      pricePerDay: parseUnits(String(pricePerDay), USDC_DECIMALS),
      deposit: parseUnits(String(deposit), USDC_DECIMALS),
      startDate: isoDateToTimestamp(start),
      endDate: isoDateToTimestamp(end),
      total: parseUnits(String(pricePerDay * days + deposit), USDC_DECIMALS),
    });

    // Straight to the rentals page: the request now exists on chain and the next move
    // belongs to the owner, so there is nothing more to do on this screen.
    if (id !== null) router.push("/rentals");
  }

  return (
    <aside className="sticky top-20 flex flex-col gap-4 rounded-card border border-line bg-surface p-5">
      <div>
        <span className="tabular text-2xl">{money(pricePerDay)}</span>{" "}
        <span className="text-sm text-ink-muted">USDC per day</span>
      </div>

      <div className="flex gap-3">
        <label className="flex flex-1 flex-col gap-1">
          <span className="text-xs text-ink-muted">From</span>
          <input
            type="date"
            value={start}
            // Today on the chain, not on this computer. The contract refuses a booking
            // that has already ended, and it works that out from block.timestamp, so a
            // picker offering yesterday is offering something that cannot be bought.
            min={chainToday}
            onChange={(e) => setStart(e.target.value)}
            className="tabular rounded-control border border-line px-2 py-1.5 text-sm"
          />
        </label>
        <label className="flex flex-1 flex-col gap-1">
          <span className="text-xs text-ink-muted">To</span>
          <input
            type="date"
            value={end}
            // At least the day after collection, since a rental is measured in nights,
            // and never before the chain thinks tomorrow is.
            min={start ? nextDay(start) : chainToday ? nextDay(chainToday) : undefined}
            onChange={(e) => setEnd(e.target.value)}
            className="tabular rounded-control border border-line px-2 py-1.5 text-sm"
          />
        </label>
      </div>

      {invalidRange && (
        <p className="text-xs text-stop-ink">
          The return date has to be at least one day after the collection date.
        </p>
      )}
      {tooLong && (
        <p className="text-xs text-stop-ink">
          {days} days. The contract caps a rental at {MAX_RENTAL_DAYS}.
        </p>
      )}
      {clash !== undefined && (
        <p className="text-xs text-stop-ink">
          {dayLabel(clash)} is already booked. Pick dates that skip it.
        </p>
      )}

      {/* Listed rather than drawn as a grid. Sixty cells in a panel this narrow is a
          calendar nobody can read, and the answer somebody needs is which days to avoid,
          which is a short sentence whenever it is a short list. */}
      {ranges.length > 0 && (
        <p className="text-xs text-ink-muted">
          {/* Not tabular. That class is for columns of figures that have to line up, and
              a date inside a sentence rendered in monospace just reads as a gap. */}
          Already booked:{" "}
          {ranges
            .map((range) =>
              range.from === range.to
                ? dayLabel(range.from)
                : `${dayLabel(range.from)} to ${dayLabel(range.to)}`
            )
            .join(", ")}
          . A rental can start on the day another one ends.
        </p>
      )}

      {days !== null && days > 0 && !tooLong && (
        <dl className="flex flex-col gap-2 border-t border-line pt-4 text-sm">
          <Line
            label={`${money(pricePerDay)} USDC x up to ${days} ${days === 1 ? "day" : "days"}`}
          >
            {money(maxRent)}
          </Line>
          <Line label="Refundable deposit">{money(deposit)}</Line>
          <Line label="You pay now" strong>
            {money(payNow)}
          </Line>

          <div className="border-t border-line pt-2">
            <Line label="Back when you return it" muted>
              {money(deposit)}
            </Line>
            <Line label="Owner receives at most, after the 1% fee" muted>
              {money(maxRent - fee)}
            </Line>
          </div>

          {/* The part that decides what people actually pay, so it is spelled out rather
              than buried in terms nobody opens. */}
          <p className="border-t border-line pt-2 text-xs text-ink-muted">
            A day is 24 hours from the moment you collect the item, not a calendar date.
            Bring it back early and the days you did not use are refunded when the owner
            confirms the return. Keep it past 24 hours into another day and that day is
            charged in full, up to the{" "}
            <span className="tabular">{money(maxRent)}</span> USDC held here.
          </p>
        </dl>
      )}

      <button
        onClick={submit}
        disabled={busy || !canSubmit}
        className="rounded-control bg-ink-strong px-4 py-2 text-sm text-canvas active:scale-[0.98] disabled:opacity-40"
      >
        {label}
      </button>

      {error && <p className="text-xs text-stop-ink">{error}</p>}

      <p className="text-xs text-ink-muted">
        One signature approves the USDC and sends the request together. The owner has to
        accept before anything is charged, and you can cancel until they do.
      </p>
    </aside>
  );
}

function Line({
  label,
  children,
  strong,
  muted,
}: {
  label: string;
  children: React.ReactNode;
  strong?: boolean;
  muted?: boolean;
}) {
  return (
    <div
      className={`flex items-baseline justify-between gap-4 ${muted ? "text-xs text-ink-muted" : ""}`}
    >
      <dt className={strong ? "text-ink-strong" : undefined}>{label}</dt>
      <dd className={strong ? "text-ink-strong" : undefined}>
        <span className="tabular">{children}</span>{" "}
        <span className={muted ? "" : "text-ink-muted"}>USDC</span>
      </dd>
    </div>
  );
}

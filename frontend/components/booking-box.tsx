"use client";

import { useState } from "react";

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
  pricePerDay,
  deposit,
  initialStart = "",
  initialEnd = "",
}: {
  pricePerDay: number;
  deposit: number;
  initialStart?: string;
  initialEnd?: string;
}) {
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

  // What the booked range buys is an allowance, not a bill. The escrow holds this much,
  // and the final charge is worked out from the clock when the item comes back: a rental
  // day is 24 hours from check-in, and unused days are refunded.
  const maxRent = days && days > 0 ? pricePerDay * days : 0;
  const fee = (maxRent * FEE_BPS) / 10_000;
  const payNow = maxRent + deposit;

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
            onChange={(e) => setStart(e.target.value)}
            className="tabular rounded-control border border-line px-2 py-1.5 text-sm"
          />
        </label>
        <label className="flex flex-1 flex-col gap-1">
          <span className="text-xs text-ink-muted">To</span>
          <input
            type="date"
            value={end}
            // At least the day after collection, since a rental is measured in nights.
            min={start ? nextDay(start) : undefined}
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

      {/* Says what it is rather than pretending to work. The escrow call arrives in
          checkpoint 6, and a button that silently does nothing is worse than an honest
          disabled one. */}
      <button
        disabled
        className="rounded-control bg-ink-strong px-4 py-2 text-sm text-white disabled:opacity-40"
      >
        Request to rent
      </button>
      <p className="text-xs text-ink-muted">
        Renting goes on chain in checkpoint 6. Nothing is charged yet.
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

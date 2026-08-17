"use client";

import { useEffect, useState } from "react";
import { formatUnits } from "viem";
import { USDC_DECIMALS, bytes32ToListingId } from "@/lib/escrow";
import type { Earnings as Figures } from "@/lib/use-escrow-balances";

type Titles = Record<string, string>;

function money(value: bigint) {
  return Number(formatUnits(value, USDC_DECIMALS)).toFixed(2);
}

/**
 * What lending things out has paid, for the person doing the lending.
 *
 * Deliberately not folded into the four tiles above it. Those add renting and lending
 * together to answer "how much of mine is tied up", and a deposit coming back counts there
 * and is not income. Keeping the two apart is the whole reason this exists: "Released to
 * you" is the larger number and the less meaningful one.
 *
 * Every figure is a RentSettled event, which is the contract saying what it paid rather
 * than the app saying what it thinks it should have. The one exception is labelled as an
 * exception: see "still to come" below.
 *
 * Hidden entirely for somebody who has never lent anything. An earnings panel reading zero
 * on a renter's profile is a report about a business they are not in.
 */
export function Earnings({ figures }: { figures: Figures }) {
  const [titles, setTitles] = useState<Titles>({});

  const items = [...figures.perListing.entries()].sort((a, b) => (b[1] > a[1] ? 1 : -1));

  useEffect(() => {
    if (items.length === 0) return;
    let active = true;

    void (async () => {
      try {
        // The same endpoint the listings panel below already calls. A listing's title is
        // not on the chain, only its id is, so the two have to be joined somewhere and the
        // cheapest place is here rather than in a route written for one screen.
        const response = await fetch("/api/listings/mine");
        if (!response.ok) return;
        const result = await response.json();
        const found: Titles = {};
        for (const listing of result.listings as { id: string; title: string }[]) {
          found[listing.id] = listing.title;
        }
        if (active) setTitles(found);
      } catch {
        // The ids still identify the rows. A missing title is a worse table, not a wrong one.
      }
    })();

    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items.length]);

  if (figures.lettings === 0 && figures.pending === 0) return null;

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-xl">What lending has paid</h2>
        <p className="text-sm text-ink-muted">
          Rent the contract has actually paid out to you, after its own fee. Deposits are
          not in here: they were never yours.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Figure
          label="Earned"
          value={`${money(figures.earned)} USDC`}
          note={`from ${figures.lettings} ${figures.lettings === 1 ? "letting" : "lettings"}`}
        />
        <Figure
          label="Platform fee"
          value={`${money(figures.fees)} USDC`}
          note="1% of the rent, taken on settlement"
        />
        <Figure
          label="Still to come"
          value={figures.pending === 0 ? "None" : `${money(figures.pendingAtMost)} USDC`}
          /* At most, not "will be". A day is charged from the moment the item is collected,
             so bringing it back early costs the renter less and pays the owner less. The
             booking page uses the same wording for the same quantity. */
          note={
            figures.pending === 0
              ? "Nothing is out on hire"
              : `at most, across ${figures.pending} ${figures.pending === 1 ? "rental" : "rentals"} not yet settled`
          }
        />
      </div>

      {items.length > 0 && (
        <div className="overflow-x-auto rounded-card border border-line bg-surface">
          <table className="w-full min-w-[22rem] text-sm">
            <thead className="border-b border-line text-left text-xs text-ink-muted">
              <tr>
                <th className="px-4 py-3 font-normal">Item</th>
                <th className="px-4 py-3 text-right font-normal">Earned</th>
              </tr>
            </thead>
            <tbody>
              {items.map(([listingId, amount]) => {
                const uuid = bytes32ToListingId(listingId);
                return (
                  <tr key={listingId} className="border-b border-line last:border-0">
                    <td className="px-4 py-3">
                      {/* The uuid when the title is not to hand: a deleted listing still
                          earned what it earned, and dropping the row would make the total
                          above stop adding up. */}
                      {titles[uuid] ?? (
                        <span className="tabular text-xs text-ink-muted">{uuid}</span>
                      )}
                    </td>
                    <td className="tabular px-4 py-3 text-right">{money(amount)} USDC</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function Figure({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-card border border-line bg-surface p-4">
      <span className="text-xs text-ink-muted">{label}</span>
      <span className="tabular text-xl">{value}</span>
      <span className="text-[11px] text-ink-muted">{note}</span>
    </div>
  );
}

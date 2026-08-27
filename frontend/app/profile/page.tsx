"use client";

import { useIdentityToken, usePrivy } from "@privy-io/react-auth";
import Link from "next/link";
import { useEffect, useState } from "react";
import { formatUnits } from "viem";
import { useAccount } from "wagmi";
import { Earnings } from "@/components/earnings";
import { MyListings } from "@/components/my-listings";
import { StatusStrip } from "@/components/status-strip";
import { Stars } from "@/components/stars";
import { UnreadBadge } from "@/components/unread-badge";
import { USDC_DECIMALS } from "@/lib/escrow";
import { useEscrowBalances } from "@/lib/use-escrow-balances";
import { useMyRentals } from "@/lib/use-my-rentals";
import { useUnread } from "@/lib/use-unread";

type Review = {
  id: string;
  onchain_rental_id: number;
  reviewer_address: string;
  rating: number;
  comment: string | null;
  created_at: string;
};

function money(value: bigint) {
  return Number(formatUnits(value, USDC_DECIMALS)).toFixed(2);
}

function hiddenRentalsKey(address: string) {
  return `trustfall:hidden-rentals:${address.toLowerCase()}`;
}

/**
 * Everything about you in one place: what you are renting, what you are lending, what the
 * escrow is holding, and what other people have said about you.
 *
 * This replaced a page that only listed conversations. Chat was never the thing somebody
 * came here for; it was the thing they did once they found the rental. So the rentals are
 * the list, and opening one gives the whole card, chat included.
 *
 * Reviews about you have no other home. Both sides write one at the end of a rental and
 * until now the only way to see yours was to remember which rental it came from.
 */
export default function ProfilePage() {
  const { ready, authenticated, login } = usePrivy();
  const { identityToken } = useIdentityToken();
  const { address } = useAccount();
  const { rentals, loading } = useMyRentals();
  const balances = useEscrowBalances(rentals);
  const unread = useUnread();

  const [reviews, setReviews] = useState<Review[] | null>(null);
  // A profile that has been through a lot of testing accumulates rentals nobody wants to
  // scroll past to find the recent ones. The chain keeps every one of them regardless;
  // this only decides how many the page shows before asking.
  const [showAllRentals, setShowAllRentals] = useState(false);
  // A declutter list shared by every row on this page that can be dismissed: a rental in
  // "Your rentals", an old earning in "What lending has paid". Nothing about the
  // underlying record changes anywhere else; this is only which ids this one wallet, on
  // this one browser, would rather not see again.
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());
  const [showHidden, setShowHidden] = useState(false);

  useEffect(() => {
    if (!address) return;
    try {
      const raw = localStorage.getItem(hiddenRentalsKey(address));
      if (raw) setHiddenIds(new Set(JSON.parse(raw)));
    } catch {
      // Worst case the list looks a little longer than the renter left it.
    }
  }, [address]);

  /** Deletes one review about you for real, not just off the screen. */
  async function removeReview(id: string) {
    setReviews((current) => (current ? current.filter((review) => review.id !== id) : current));
    await fetch(`/api/reviews?id=${id}`, {
      method: "DELETE",
      headers: identityToken ? { "privy-id-token": identityToken } : undefined,
    });
  }

  function hideItem(id: string) {
    if (!address) return;
    const next = new Set(hiddenIds);
    next.add(id);
    setHiddenIds(next);
    try {
      localStorage.setItem(hiddenRentalsKey(address), JSON.stringify([...next]));
    } catch {
      // Local-only convenience; a failed write just means it reappears next visit.
    }
  }

  useEffect(() => {
    if (!address) return;
    let active = true;

    void (async () => {
      try {
        const response = await fetch(
          `/api/reviews?about=${address.toLowerCase()}`,
        );
        if (!response.ok) return;
        const result = await response.json();
        if (active) setReviews(result.reviews as Review[]);
      } catch {
        // The rest of the page is worth showing without them.
      }
    })();

    return () => {
      active = false;
    };
  }, [address]);

  if (!ready) return <p className="text-sm text-ink-muted">Loading...</p>;

  if (!authenticated) {
    return (
      <main className="flex flex-col gap-4">
        <h1 className="text-3xl">Profile</h1>
        <p className="max-w-xl text-sm text-ink-muted">
          Sign in to see your rentals, your balance and your reviews.
        </p>
        <button
          onClick={login}
          className="w-fit rounded-control bg-ink-strong px-4 py-2 text-sm text-canvas"
        >
          Sign in
        </button>
      </main>
    );
  }

  const me = address?.toLowerCase();
  const renting = rentals.filter(
    (rental) => rental.renter.toLowerCase() === me,
  );
  const lending = rentals.filter((rental) => rental.owner.toLowerCase() === me);
  const visibleRentals = showHidden
    ? rentals
    : rentals.filter((rental) => !hiddenIds.has(rental.id.toString()));
  const RENTALS_SHOWN = 8;
  const shownRentals = showAllRentals ? visibleRentals : visibleRentals.slice(0, RENTALS_SHOWN);
  const moreCount = visibleRentals.length - shownRentals.length;
  const average =
    reviews && reviews.length > 0
      ? reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length
      : null;

  return (
    <main className="flex max-w-[76rem] flex-col gap-8">
      <header className="flex flex-col gap-1">
        <h1 className="text-3xl">Profile</h1>
        <p className="tabular text-xs break-all text-ink-muted">{address}</p>
      </header>

      <div className="grid gap-8 lg:grid-cols-[1fr_22rem]">
        <div className="flex flex-col gap-8">
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Stat label="Renting" value={String(renting.length)} />
            <Stat label="Lending out" value={String(lending.length)} />
            <Stat
              label="Held in escrow"
              value={`${money(balances.held)} USDC`}
              note="Yours, and the contract still has it"
            />
            <Stat
              label="Released to you"
              value={`${money(balances.released)} USDC`}
              note="Deposits back, plus rent earned"
            />
          </section>

          {/* Above the rental list, because somebody who lends things opens this page to
              find out how it is going, and below the four tiles, because those are the
              wider picture this one narrows. Renders nothing at all for a pure renter. */}
          <Earnings figures={balances.earnings} hiddenIds={hiddenIds} onHide={hideItem} />

          <section className="flex flex-col gap-4">
            <div className="flex items-baseline gap-3">
              <h2 className="text-xl">Your rentals</h2>
              <span className="text-xs text-ink-muted">
                Open one to act on it and to talk.
              </span>
            </div>

            {loading && rentals.length === 0 && (
              <p className="text-sm text-ink-muted">Reading the chain...</p>
            )}
            {!loading && rentals.length === 0 && (
              <p className="text-sm text-ink-muted">Nothing yet.</p>
            )}

            {/* Each one opens its own page rather than unfolding here. A rental has a QR
            code, a countdown, a settlement and a conversation in it, and four of those
            expanded at once buries the list they were meant to be part of. Its own address
            also means a notification can point straight at it. */}
            {shownRentals.map((rental) => {
              const mine = rental.owner.toLowerCase() === me;
              const id = rental.id.toString();
              return (
                <div
                  key={id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-line bg-surface px-4 py-3"
                >
                  <Link href={`/rentals/${rental.id}`} className="flex items-center gap-3">
                    <span className="tabular text-sm">Rental #{id}</span>
                    <span className="text-xs text-ink-muted">
                      {mine ? "you are lending" : "you are renting"}
                    </span>
                    <UnreadBadge count={unread.counts[id] ?? 0} />
                  </Link>
                  <span className="flex items-center gap-3">
                    <StatusStrip status={rental.status} />
                    <Link href={`/rentals/${rental.id}`} className="text-xs text-ink-muted">
                      open
                    </Link>
                    {/* The renter's own declutter button. Not offered on the lending side:
                        an owner watching for a request to approve should not be able to
                        make that row disappear by mistake. */}
                    {!mine && !hiddenIds.has(id) && (
                      <button
                        onClick={() => hideItem(id)}
                        className="text-xs text-ink-muted underline decoration-line underline-offset-4"
                      >
                        Remove
                      </button>
                    )}
                  </span>
                </div>
              );
            })}

            {visibleRentals.length > RENTALS_SHOWN && (
              <button
                onClick={() => setShowAllRentals((value) => !value)}
                className="self-start text-xs text-ink-muted underline decoration-line underline-offset-4"
              >
                {showAllRentals ? "Show fewer" : `Show ${moreCount} more`}
              </button>
            )}

            {hiddenIds.size > 0 && (
              <button
                onClick={() => setShowHidden((value) => !value)}
                className="self-start text-xs text-ink-muted underline decoration-line underline-offset-4"
              >
                {showHidden
                  ? "Hide the removed rentals again"
                  : `${hiddenIds.size} removed. Show them`}
              </button>
            )}
          </section>

          <MyListings />
        </div>

        <section className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <h2 className="text-xl">What people said about you</h2>
            {average !== null && (
              <span className="text-sm text-ink-muted">
                <span className="tabular">{average.toFixed(1)}</span> from{" "}
                {reviews?.length}
              </span>
            )}
          </div>

          {reviews === null && (
            <p className="text-sm text-ink-muted">Loading...</p>
          )}
          {reviews?.length === 0 && (
            <p className="text-sm text-ink-muted">
              Nothing yet. Reviews open when a rental is finished.
            </p>
          )}

          {reviews?.map((review) => (
            <article
              key={review.id}
              className="flex flex-col gap-1.5 rounded-card border border-line bg-surface p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <Stars value={review.rating} />
                <button
                  onClick={() => removeReview(review.id)}
                  className="text-xs text-ink-muted underline decoration-line underline-offset-4"
                >
                  Remove
                </button>
              </div>
              <span className="tabular text-[11px] text-ink-muted">
                Rental #{review.onchain_rental_id} ·{" "}
                {review.reviewer_address.slice(0, 6)}...
                {review.reviewer_address.slice(-4)}
              </span>
              {review.comment && <p className="text-sm">{review.comment}</p>}
            </article>
          ))}
        </section>
      </div>
    </main>
  );
}

function Stat({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note?: string;
}) {
  return (
    <div className="flex flex-col gap-1 rounded-card border border-line bg-surface p-4">
      <span className="text-xs text-ink-muted">{label}</span>
      <span className="tabular text-xl">{value}</span>
      {note && <span className="text-[11px] text-ink-muted">{note}</span>}
    </div>
  );
}

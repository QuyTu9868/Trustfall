"use client";

import { usePrivy } from "@privy-io/react-auth";
import Link from "next/link";
import { useEffect, useState } from "react";
import { formatUnits } from "viem";
import { useAccount } from "wagmi";
import { MyListings } from "@/components/my-listings";
import { StatusStrip } from "@/components/status-strip";
import { UnreadBadge } from "@/components/unread-badge";
import { USDC_DECIMALS } from "@/lib/escrow";
import { useEscrowBalances } from "@/lib/use-escrow-balances";
import { useMyRentals } from "@/lib/use-my-rentals";
import { useUnread } from "@/lib/use-unread";

type Review = {
  onchain_rental_id: number;
  reviewer_address: string;
  rating: number;
  comment: string | null;
  created_at: string;
};

function money(value: bigint) {
  return Number(formatUnits(value, USDC_DECIMALS)).toFixed(2);
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
  const { address } = useAccount();
  const { rentals, loading } = useMyRentals();
  const balances = useEscrowBalances(rentals);
  const unread = useUnread();

  const [reviews, setReviews] = useState<Review[] | null>(null);

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
            {rentals.map((rental) => {
              const mine = rental.owner.toLowerCase() === me;
              return (
                <Link
                  key={rental.id.toString()}
                  href={`/rentals/${rental.id}`}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-line bg-surface px-4 py-3"
                >
                  <span className="flex items-center gap-3">
                    <span className="tabular text-sm">
                      Rental #{rental.id.toString()}
                    </span>
                    <span className="text-xs text-ink-muted">
                      {mine ? "you are lending" : "you are renting"}
                    </span>
                    <UnreadBadge
                      count={unread.counts[rental.id.toString()] ?? 0}
                    />
                  </span>
                  <span className="flex items-center gap-3">
                    <StatusStrip status={rental.status} />
                    <span className="text-xs text-ink-muted">open</span>
                  </span>
                </Link>
              );
            })}
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
              key={`${review.onchain_rental_id}-${review.reviewer_address}`}
              className="flex flex-col gap-1.5 rounded-card border border-line bg-surface p-4"
            >
              <Stars value={review.rating} />
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

function Stars({ value }: { value: number }) {
  return (
    <span className="flex gap-0.5" aria-label={`${value} out of 5`}>
      {[1, 2, 3, 4, 5].map((star) => (
        <span
          key={star}
          className={star <= value ? "text-ink-strong" : "text-line"}
        >
          ★
        </span>
      ))}
    </span>
  );
}

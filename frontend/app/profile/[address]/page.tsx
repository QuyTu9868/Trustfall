"use client";

import { use, useEffect, useState } from "react";
import { useAccount } from "wagmi";
import { MyListings } from "@/components/my-listings";
import { OwnerListings } from "@/components/owner-listings";
import { Stars } from "@/components/stars";

type Review = {
  onchain_rental_id: number;
  reviewer_address: string;
  rating: number;
  comment: string | null;
  created_at: string;
};

/**
 * Anyone's review history, read only, no sign-in.
 *
 * The data was already public - /api/reviews?about= never required a token - this is the
 * page that was missing to reach it. An address shown as plain text everywhere else in the
 * app (a listing's owner, a rental's other side) is the thing this exists to be linked from.
 */
export default function PublicProfilePage({
  params,
}: {
  params: Promise<{ address: string }>;
}) {
  const { address } = use(params);
  const { address: myAddress } = useAccount();
  const isMe = myAddress?.toLowerCase() === address.toLowerCase();
  const [reviews, setReviews] = useState<Review[] | null>(null);

  useEffect(() => {
    let active = true;
    void fetch(`/api/reviews?about=${address.toLowerCase()}`)
      .then((r) => r.json())
      .then((result) => {
        if (active) setReviews(result.reviews as Review[]);
      })
      .catch(() => {
        if (active) setReviews([]);
      });
    return () => {
      active = false;
    };
  }, [address]);

  const average =
    reviews && reviews.length > 0
      ? reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length
      : null;

  return (
    <main className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <span className="text-xs tracking-wide text-ink-muted uppercase">Profile</span>
        <h1 className="tabular text-2xl break-all">{address}</h1>
        {average !== null && (
          <div className="mt-2 flex items-center gap-2 text-sm">
            <span className="tabular text-ink-strong">{average.toFixed(1)}</span>
            <Stars value={Math.round(average)} />
            <span className="text-ink-muted">
              from {reviews?.length} {reviews?.length === 1 ? "review" : "reviews"}
            </span>
          </div>
        )}
      </div>

      <section className="flex flex-col gap-3">
        {reviews === null && <p className="text-sm text-ink-muted">Loading...</p>}
        {reviews?.length === 0 && (
          <p className="text-sm text-ink-muted">Nothing yet.</p>
        )}
        {reviews?.map((review) => (
          <article
            key={`${review.onchain_rental_id}-${review.reviewer_address}`}
            className="flex flex-col gap-1.5 rounded-card border border-line bg-surface p-4"
          >
            <Stars value={review.rating} />
            <span className="tabular text-[11px] text-ink-muted">
              Rental #{review.onchain_rental_id} · {review.reviewer_address.slice(0, 6)}...
              {review.reviewer_address.slice(-4)}
            </span>
            {review.comment && <p className="text-sm">{review.comment}</p>}
          </article>
        ))}
      </section>

      {/* Your own address gets the full page: pending and rejected listings included, with
          edit and delete. A stranger's address only ever gets what everyone else can
          already see, laid out as the same square cards the browse grid uses. */}
      {isMe ? (
        <MyListings />
      ) : (
        <section className="flex flex-col gap-4">
          <h2 className="text-xl">Listed by this address</h2>
          <OwnerListings address={address} />
        </section>
      )}
    </main>
  );
}

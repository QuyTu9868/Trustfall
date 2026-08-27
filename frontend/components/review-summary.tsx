"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Stars } from "./stars";

type Review = {
  onchain_rental_id: number;
  reviewer_address: string;
  rating: number;
  comment: string | null;
  created_at: string;
};

const RECENT_SHOWN = 2;

/**
 * A quick read on who you are about to deal with, right where the decision is made.
 *
 * /api/reviews?about= is already public - no token, no sign-in - so this is the same data
 * the person's own profile shows, just surfaced before the click that commits money rather
 * than after. The total score is the link out to the rest of it, so somebody who wants the
 * full history is one click from it and everybody else is not made to go looking.
 */
export function ReviewSummary({ address }: { address: string }) {
  const [reviews, setReviews] = useState<Review[] | null>(null);

  useEffect(() => {
    let active = true;
    void fetch(`/api/reviews?about=${address.toLowerCase()}`)
      .then((r) => r.json())
      .then((result) => {
        if (active) setReviews(result.reviews as Review[]);
      })
      .catch(() => {
        // The booking box works fine without this; it is a nice-to-know, not a blocker.
      });
    return () => {
      active = false;
    };
  }, [address]);

  if (reviews === null) return null;

  if (reviews.length === 0) {
    return (
      <div className="flex flex-col gap-1 border-t border-line pt-4">
        <span className="text-xs text-ink-muted">No reviews yet for this address.</span>
      </div>
    );
  }

  const average = reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length;

  return (
    <div className="flex flex-col gap-3 border-t border-line pt-4">
      <Link
        href={`/profile/${address.toLowerCase()}`}
        className="flex items-center gap-2 text-sm underline decoration-line underline-offset-4"
      >
        <span className="tabular text-ink-strong">{average.toFixed(1)}</span>
        <Stars value={Math.round(average)} />
        <span className="text-ink-muted">
          from {reviews.length} {reviews.length === 1 ? "review" : "reviews"}
        </span>
      </Link>

      <div className="flex flex-col gap-2">
        {reviews.slice(0, RECENT_SHOWN).map((review) => (
          <div
            key={`${review.onchain_rental_id}-${review.reviewer_address}`}
            className="flex flex-col gap-1 rounded-card bg-canvas p-3"
          >
            <Stars value={review.rating} />
            {review.comment && (
              <p className="line-clamp-2 text-xs text-ink-muted">{review.comment}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

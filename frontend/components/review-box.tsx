"use client";

import { useIdentityToken, usePrivy } from "@privy-io/react-auth";
import { useEffect, useState } from "react";
import { useAccount } from "wagmi";

type Review = {
  reviewer_address: string;
  reviewee_address: string;
  rating: number;
  comment: string | null;
  created_at: string;
};

/**
 * Two-way review, shown once a rental reaches Completed.
 *
 * Both sides are on screen from the start, including the one that has not been written
 * yet. Hiding the other person's slot until they fill it makes a one-sided review look
 * like the whole story, and on a marketplace where both parties are being judged that
 * reads as a missing review rather than a pending one.
 *
 * The server decides whether a review is allowed, not this component. It re-reads the
 * rental from the chain and re-derives who is asking from the Privy token, so the props
 * here only shape what is drawn.
 */
export function ReviewBox({
  rentalId,
  counterparty,
  role,
}: {
  rentalId: bigint;
  counterparty: `0x${string}`;
  role: "owner" | "renter";
}) {
  const { authenticated, login } = usePrivy();
  const { identityToken } = useIdentityToken();
  const { address } = useAccount();

  const [reviews, setReviews] = useState<Review[] | null>(null);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Bumped after a successful post. Refetching instead of pushing the new review into
  // state locally means the screen shows what the database actually stored.
  const [reloads, setReloads] = useState(0);

  useEffect(() => {
    let active = true;

    (async () => {
      const response = await fetch(`/api/reviews?rentalId=${rentalId}`, {
        cache: "no-store",
      });
      if (!response.ok) return;
      const result = await response.json();
      if (active) setReviews(result.reviews as Review[]);
    })();

    return () => {
      active = false;
    };
  }, [rentalId, reloads]);

  const me = address?.toLowerCase();
  const mine = reviews?.find((review) => review.reviewer_address === me);
  const theirs = reviews?.find((review) => review.reviewer_address === counterparty.toLowerCase());
  const other = role === "owner" ? "the renter" : "the owner";

  async function submit() {
    setError(null);
    if (!authenticated) {
      login();
      return;
    }
    if (rating === 0) {
      setError("Pick a rating first.");
      return;
    }

    setSending(true);
    try {
      const response = await fetch("/api/reviews", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(identityToken ? { "privy-id-token": identityToken } : {}),
        },
        body: JSON.stringify({ rentalId: rentalId.toString(), rating, comment }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Could not save that.");
      setReloads((count) => count + 1);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save that.");
    } finally {
      setSending(false);
    }
  }

  return (
    <section className="flex flex-col gap-4 rounded-card border border-line bg-canvas p-4">
      <h3 className="text-sm">Reviews</h3>

      {mine ? (
        <Written label={`You reviewed ${other}`} review={mine} />
      ) : (
        <div className="flex flex-col gap-3">
          <span className="text-xs text-ink-muted">
            How was {other}? They can see this.
          </span>
          <Stars value={rating} onChange={setRating} />
          <textarea
            value={comment}
            onChange={(event) => setComment(event.target.value)}
            maxLength={1000}
            rows={3}
            placeholder="Optional. A sentence is plenty."
            className="rounded-control border border-line bg-surface px-3 py-2 text-sm"
          />
          <div>
            <button
              onClick={submit}
              disabled={sending}
              className="rounded-control bg-ink-strong px-4 py-2 text-sm text-canvas active:scale-[0.98] disabled:opacity-40"
            >
              {sending ? "Saving..." : "Post the review"}
            </button>
          </div>
          {error && <p className="text-xs text-stop-ink">{error}</p>}
        </div>
      )}

      {theirs ? (
        <Written
          label={`What ${other} said about you`}
          review={theirs}
        />
      ) : (
        <p className="text-xs text-ink-muted">
          {other[0].toUpperCase() + other.slice(1)} has not written one yet.
        </p>
      )}
    </section>
  );
}

function Written({ label, review }: { label: string; review: Review }) {
  return (
    <div className="flex flex-col gap-1 border-t border-line pt-3 first:border-0 first:pt-0">
      <span className="text-xs text-ink-muted">{label}</span>
      <Stars value={review.rating} />
      {review.comment && <p className="text-sm">{review.comment}</p>}
    </div>
  );
}

/**
 * Read-only when no handler is passed, so the same row of stars serves the form and the
 * finished review. One shape, so a 4 always looks like a 4.
 */
function Stars({ value, onChange }: { value: number; onChange?: (value: number) => void }) {
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map((star) => {
        const filled = star <= value;
        if (!onChange) {
          return (
            <span key={star} className={filled ? "text-ink-strong" : "text-line"}>
              ★
            </span>
          );
        }
        return (
          <button
            key={star}
            type="button"
            aria-label={`${star} out of 5`}
            onClick={() => onChange(star)}
            className={`text-xl leading-none ${filled ? "text-ink-strong" : "text-line"}`}
          >
            ★
          </button>
        );
      })}
    </div>
  );
}

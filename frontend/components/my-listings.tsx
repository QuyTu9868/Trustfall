"use client";

import { useIdentityToken, usePrivy } from "@privy-io/react-auth";
import Link from "next/link";
import { useEffect, useState } from "react";
import { formatUsdc } from "@/lib/listing";

type MyListing = {
  id: string;
  title: string;
  price_per_day: string;
  deposit: string;
  status: string;
  moderation_status: "pending" | "approved" | "rejected";
  moderation_reason: string | null;
  listing_images: { url: string; sort_order: number }[];
};

/**
 * The owner's own listings, including the ones nobody else can see.
 *
 * Lives on the profile now. It was its own page and its own navbar entry, which put two
 * lists of your own things two clicks apart for no reason anybody could name.
 *
 * This page exists because listings are now saved before they are checked. That change
 * stopped a refresh from destroying a description and two photographs, and created a
 * place a listing can sit where its author cannot reach it: rejected, or still pending
 * because the check was interrupted. CLAUDE.md section 9 requires a rejection to be
 * fixable, and a rejection nobody can find is not.
 */
export function MyListings() {
  const { authenticated } = usePrivy();
  const { identityToken } = useIdentityToken();

  const [listings, setListings] = useState<MyListing[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloads, setReloads] = useState(0);

  useEffect(() => {
    if (!authenticated) return;
    let active = true;

    void (async () => {
      try {
        const response = await fetch("/api/listings/mine");
        if (!response.ok) return;
        const result = await response.json();
        if (active) setListings(result.listings as MyListing[]);
      } catch {
        // Leaves the list as loading rather than claiming there is nothing here.
      }
    })();

    return () => {
      active = false;
    };
  }, [authenticated, reloads]);

  async function remove(id: string) {
    setBusy(id);
    setError(null);
    try {
      const response = await fetch(`/api/listings/${id}`, {
        method: "DELETE",
        headers: identityToken ? { "privy-id-token": identityToken } : undefined,
      });
      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.error ?? "Could not delete that.");
      }
      setReloads((count) => count + 1);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not delete that.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-baseline gap-3">
        <h2 className="text-xl">Things you have listed</h2>
        <span className="text-xs text-ink-muted">
          Including the ones still being checked and the ones that did not pass.
        </span>
      </div>

      {listings === null && <p className="text-sm text-ink-muted">Loading...</p>}

      {listings?.length === 0 && (
        <p className="text-sm text-ink-muted">
          Nothing yet.{" "}
          <Link href="/list" className="underline decoration-line">
            List something
          </Link>
          .
        </p>
      )}

      {listings?.map((listing) => (
        <article
          key={listing.id}
          className="flex flex-col gap-3 rounded-card border border-line bg-surface p-5"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex flex-col gap-1.5">
              <StateTag state={listing.moderation_status} />
              <h2 className="text-lg">{listing.title}</h2>
            </div>
            <div className="text-right text-sm">
              <div className="tabular">{formatUsdc(listing.price_per_day)} USDC a day</div>
              <div className="tabular text-xs text-ink-muted">
                {formatUsdc(listing.deposit)} USDC deposit
              </div>
            </div>
          </div>

          {/* The reason is the message, not a footnote. Somebody reading this has one
              question and it is what to change. */}
          {listing.moderation_status === "rejected" && listing.moderation_reason && (
            <p className="rounded-card border border-line bg-stop-bg px-4 py-3 text-sm text-stop-ink">
              {listing.moderation_reason}
            </p>
          )}

          {listing.moderation_status === "pending" && (
            <p className="rounded-card border border-line bg-pend-bg px-4 py-3 text-sm text-pend-ink">
              Still waiting on the check. If it was interrupted, editing and saving runs it
              again.
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            {listing.moderation_status === "approved" && (
              <Link
                href={`/listings/${listing.id}`}
                className="rounded-control border border-line px-3 py-2 text-sm"
              >
                View
              </Link>
            )}
            <Link
              href={`/list?edit=${listing.id}`}
              className="rounded-control bg-ink-strong px-4 py-2 text-sm text-canvas"
            >
              {listing.moderation_status === "approved" ? "Edit" : "Edit and try again"}
            </Link>
            <button
              onClick={() => remove(listing.id)}
              disabled={busy === listing.id}
              className="rounded-control border border-line px-3 py-2 text-sm disabled:opacity-50"
            >
              {busy === listing.id ? "Deleting..." : "Delete"}
            </button>
          </div>
        </article>
      ))}

      {error && <p className="text-xs text-stop-ink">{error}</p>}
    </section>
  );
}

function StateTag({ state }: { state: MyListing["moderation_status"] }) {
  const tone =
    state === "approved"
      ? "bg-live-bg text-live-ink"
      : state === "rejected"
        ? "bg-stop-bg text-stop-ink"
        : "bg-pend-bg text-pend-ink";
  const label =
    state === "approved" ? "live" : state === "rejected" ? "not accepted" : "being checked";

  return (
    <span className={`w-fit rounded-full px-2 py-0.5 text-xs tracking-wide uppercase ${tone}`}>
      {label}
    </span>
  );
}

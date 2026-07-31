"use client";

import { useEffect, useState } from "react";
import { CATEGORY_LABELS, type Category, formatUsdc } from "@/lib/listing";
import { Photo } from "@/components/photo";

type Listing = {
  id: string;
  owner_address: string;
  category: Category;
  title: string;
  description: string;
  price_per_day: string;
  deposit: string;
  moderation_status: string;
  listing_images: { url: string; sort_order: number; uploaded_at: string }[];
};

/**
 * Confirmation after publishing, read back from the database rather than reusing the form
 * state. Redisplaying what was typed only proves the form works. Reading it back proves
 * the row and both images actually landed, which is what this checkpoint is about.
 */
export function PublishedListing({
  id,
  onAnother,
}: {
  id: string;
  onAnother: () => void;
}) {
  const [listing, setListing] = useState<Listing | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetch(`/api/listings/${id}`)
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error ?? "Could not load it back.");
        if (active) setListing(result);
      })
      .catch((cause) => {
        if (active) setError(cause instanceof Error ? cause.message : "Failed to load.");
      });
    return () => {
      active = false;
    };
  }, [id]);

  return (
    <main className="flex max-w-2xl flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-3xl">Published</h1>
        <p className="text-sm text-ink-muted">
          Read back from the database, not from the form.
        </p>
      </header>

      {error && <p className="text-sm text-stop-ink">{error}</p>}
      {!listing && !error && <p className="text-sm text-ink-muted">Loading...</p>}

      {listing && (
        <div className="rounded-card border border-line bg-surface">
          <div className="grid grid-cols-2 gap-3 p-4">
            {listing.listing_images.map((image, index) => (
              <Photo
                key={image.url}
                src={image.url}
                alt={`${listing.title}, photo ${index + 1}`}
                sizes="(max-width: 640px) 100vw, 20rem"
              />
            ))}
          </div>
          <dl className="divide-y divide-line border-t border-line text-sm">
            <Row label="Title">{listing.title}</Row>
            <Row label="Category">{CATEGORY_LABELS[listing.category]}</Row>
            <Row label="Price per day">
              <span className="tabular">{formatUsdc(listing.price_per_day)} USDC</span>
            </Row>
            <Row label="Deposit">
              <span className="tabular">{formatUsdc(listing.deposit)} USDC</span>
            </Row>
            <Row label="Owner">
              <span className="tabular text-xs break-all">{listing.owner_address}</span>
            </Row>
            <Row label="Moderation">
              <span className="rounded-full bg-pend-bg px-2 py-0.5 text-xs tracking-wide text-pend-ink uppercase">
                {listing.moderation_status}
              </span>
            </Row>
            <Row label="Photo timestamp">
              {/* Written by the database clock, never taken from EXIF. */}
              <span className="tabular text-xs">
                {listing.listing_images[0]?.uploaded_at ?? "-"}
              </span>
            </Row>
            <Row label="Listing id">
              <span className="tabular text-xs break-all">{listing.id}</span>
            </Row>
          </dl>
        </div>
      )}

      <button
        onClick={onAnother}
        className="w-fit rounded-control border border-line px-4 py-2 text-sm"
      >
        List another item
      </button>
    </main>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 px-4 py-2.5">
      <dt className="text-ink-muted">{label}</dt>
      <dd className="text-right">{children}</dd>
    </div>
  );
}

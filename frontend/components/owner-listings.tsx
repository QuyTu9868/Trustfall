"use client";

import { useEffect, useState } from "react";
import { ListingCard } from "@/components/listing-card";
import type { ListingCard as Listing } from "@/lib/listings-query";

/** A stranger's published listings, as the same square cards the browse grid uses. */
export function OwnerListings({ address }: { address: string }) {
  const [listings, setListings] = useState<Listing[] | null>(null);

  useEffect(() => {
    let active = true;
    void fetch(`/api/listings/by-owner?address=${address.toLowerCase()}`)
      .then((r) => r.json())
      .then((result) => {
        if (active) setListings(result.listings as Listing[]);
      })
      .catch(() => {
        if (active) setListings([]);
      });
    return () => {
      active = false;
    };
  }, [address]);

  if (listings === null) return <p className="text-sm text-ink-muted">Loading...</p>;
  if (listings.length === 0) {
    return <p className="text-sm text-ink-muted">Nothing listed right now.</p>;
  }

  return (
    <div className="grid grid-cols-2 gap-x-5 gap-y-8 sm:grid-cols-3 lg:grid-cols-4">
      {listings.map((listing) => (
        <ListingCard key={listing.id} listing={listing} />
      ))}
    </div>
  );
}

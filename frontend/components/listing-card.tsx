import Link from "next/link";
import { Photo } from "@/components/photo";
import { CATEGORY_LABELS } from "@/lib/listing";
import type { ListingCard as Listing } from "@/lib/listings-query";

export function ListingCard({ listing, priority }: { listing: Listing; priority?: boolean }) {
  const cover = listing.listing_images[0]?.url;

  return (
    <Link href={`/listings/${listing.id}`} className="group flex flex-col gap-3">
      {cover ? (
        // cover, not contain: a grid reads as a grid only when every card is the same
        // shape. Seeing the whole photo is the detail page's job.
        <Photo
          src={cover}
          alt={listing.title}
          fit="cover"
          priority={priority}
          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
        />
      ) : (
        <div className="flex aspect-4/3 items-center justify-center rounded-card border border-line bg-canvas text-xs text-ink-muted">
          No photo
        </div>
      )}

      <div className="flex flex-col gap-0.5">
        <span className="text-xs tracking-wide text-ink-muted uppercase">
          {CATEGORY_LABELS[listing.category]}
        </span>
        <span className="text-sm group-hover:underline">{listing.title}</span>
        <span className="text-sm">
          <span className="tabular">{Number(listing.price_per_day).toFixed(2)}</span> USDC
          <span className="text-ink-muted"> per day</span>
        </span>
        <span className="text-xs text-ink-muted">
          <span className="tabular">{Number(listing.deposit).toFixed(2)}</span> USDC deposit
        </span>
      </div>
    </Link>
  );
}

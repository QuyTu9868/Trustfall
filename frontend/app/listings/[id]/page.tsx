import Link from "next/link";
import { notFound } from "next/navigation";
import { BookingBox } from "@/components/booking-box";
import { Photo } from "@/components/photo";
import { CATEGORY_LABELS } from "@/lib/listing";
import { fetchListing } from "@/lib/listings-query";

/**
 * One listing.
 *
 * Photos on the left, the booking box stuck to the right while you scroll. UI-REFERENCE.md
 * section 3 calls that sticky panel the detail Airbnb gets right, and it is the one piece
 * of their layout worth copying wholesale.
 */
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export default async function ListingPage(props: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const [{ id }, query] = await Promise.all([props.params, props.searchParams]);
  const listing = await fetchListing(id);
  if (!listing) notFound();

  // Only pass through something that is actually a date, so a hand edited URL cannot put
  // junk into the date inputs.
  const from = query.from && ISO_DATE.test(query.from) ? query.from : "";
  const to = query.to && ISO_DATE.test(query.to) ? query.to : "";

  return (
    <main className="flex flex-col gap-6">
      <Link href="/" className="w-fit text-sm text-ink-muted underline decoration-line">
        Back to browse
      </Link>

      <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-[1fr_20rem]">
        <div className="flex flex-col gap-6">
          <header className="flex flex-col gap-1">
            <span className="text-xs tracking-wide text-ink-muted uppercase">
              {CATEGORY_LABELS[listing.category]}
            </span>
            <h1 className="text-3xl">{listing.title}</h1>
          </header>

          {/* Two photos, side by side, no scrolling carousel. UI-REFERENCE.md section 5
              keeps it to exactly two per item so the page stays light. */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {listing.listing_images.map((image, index) => (
              <Photo
                key={image.url}
                src={image.url}
                alt={`${listing.title}, photo ${index + 1}`}
                priority={index === 0}
                sizes="(max-width: 640px) 100vw, 40vw"
              />
            ))}
          </div>

          <section className="flex flex-col gap-2">
            <h2 className="text-lg">About this item</h2>
            <p className="max-w-2xl text-sm whitespace-pre-wrap">{listing.description}</p>
          </section>

          <section className="flex flex-col gap-2 border-t border-line pt-5">
            <h2 className="text-lg">Owner</h2>
            <p className="tabular text-xs break-all">{listing.owner_address}</p>
            <p className="text-xs text-ink-muted">
              Reviews arrive in checkpoint 7, once a rental can reach Completed.
            </p>
          </section>
        </div>

        <BookingBox
          listingId={listing.id}
          owner={listing.owner_address}
          pricePerDay={Number(listing.price_per_day)}
          deposit={Number(listing.deposit)}
          initialStart={from}
          initialEnd={to}
        />
      </div>
    </main>
  );
}

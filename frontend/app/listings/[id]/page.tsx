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

          {/* Where, and a way to get there, without this app drawing a map itself. A
              precise pin is chosen by the owner at publish time and is public from the
              start; a listing without one falls back to a text search of the area, which
              a maps app can only guess the centre of. Either way this page hands off to
              whatever maps application the reader already has rather than embedding one. */}
          {(listing.pickup_area ||
            listing.street_address ||
            (listing.lat !== null && listing.lng !== null)) && (
            <section className="flex flex-col gap-2 border-t border-line pt-5">
              <h2 className="text-lg">Where to collect it</h2>
              {listing.street_address && <p className="text-sm">{listing.street_address}</p>}
              {listing.pickup_area && (
                <p className="text-sm text-ink-muted">{listing.pickup_area}</p>
              )}
              <a
                href={
                  listing.lat !== null && listing.lng !== null
                    ? `https://www.google.com/maps/dir/?api=1&destination=${listing.lat},${listing.lng}`
                    : `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(listing.pickup_area ?? "")}`
                }
                target="_blank"
                rel="noreferrer"
                className="w-fit text-sm text-live-ink underline underline-offset-2"
              >
                Open directions
              </a>
              {listing.lat === null && (
                <p className="text-xs text-ink-muted">
                  The area, not the exact spot. Ask the owner for that in the messages once
                  they accept.
                </p>
              )}
            </section>
          )}

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

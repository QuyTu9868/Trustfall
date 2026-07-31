import Link from "next/link";
import { ListingCard } from "@/components/listing-card";
import { CATEGORIES, CATEGORY_LABELS } from "@/lib/listing";
import {
  fetchCategoryCounts,
  fetchListings,
  parseCategory,
} from "@/lib/listings-query";

/**
 * Browse. A grid of cards, a row of category filters, page numbers underneath.
 *
 * All of it runs on the server and all of the state lives in the URL, so there is no
 * client JavaScript here at all: filtering is a link, paging is a link, and any view can
 * be bookmarked or sent to somebody. UI-REFERENCE.md section 3 also asks for the filters
 * laid out along the top rather than hidden in a drawer, and section 5 rules out infinite
 * scroll in favour of pages.
 */
export default async function BrowsePage(props: {
  searchParams: Promise<{ category?: string; page?: string }>;
}) {
  const searchParams = await props.searchParams;
  const category = parseCategory(searchParams.category);
  const page = Math.max(1, Number(searchParams.page ?? 1) || 1);

  const [{ listings, total, pageCount }, { counts, total: allCount }] = await Promise.all([
    fetchListings({ category, page }),
    fetchCategoryCounts(),
  ]);

  const href = (next: { category?: string | null; page?: number }) => {
    const params = new URLSearchParams();
    const cat = next.category === undefined ? category : next.category;
    if (cat) params.set("category", cat);
    if (next.page && next.page > 1) params.set("page", String(next.page));
    const query = params.toString();
    return query ? `/?${query}` : "/";
  };

  return (
    <main className="flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <h1 className="text-4xl">Rent real things, without trusting anyone.</h1>
        <p className="max-w-2xl text-sm text-ink-muted">
          Rent and deposit sit in a smart contract, not in a company&apos;s bank account.
          Both sides confirm the handover by scanning a code.
        </p>
      </header>

      <nav className="flex flex-wrap items-center gap-2 border-b border-line pb-4">
        <FilterLink href={href({ category: null, page: 1 })} active={!category}>
          All <Count n={allCount} />
        </FilterLink>
        {CATEGORIES.map((value) => (
          <FilterLink
            key={value}
            href={href({ category: value, page: 1 })}
            active={category === value}
          >
            {CATEGORY_LABELS[value]} <Count n={counts[value] ?? 0} />
          </FilterLink>
        ))}
      </nav>

      {listings.length === 0 ? (
        <p className="text-sm text-ink-muted">
          Nothing listed in this category yet.{" "}
          <Link href="/list" className="underline decoration-line">
            List an item
          </Link>
          .
        </p>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-x-5 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
            {listings.map((listing, index) => (
              // The first row is above the fold, so it loads eagerly. Everything below it
              // waits until it is scrolled to, which is what next/image does by default.
              <ListingCard key={listing.id} listing={listing} priority={index < 3} />
            ))}
          </div>

          {pageCount > 1 && (
            <nav className="flex items-center gap-3 border-t border-line pt-4 text-sm">
              <PageLink href={href({ page: page - 1 })} disabled={page === 1}>
                Previous
              </PageLink>
              <span className="tabular text-xs text-ink-muted">
                Page {page} of {pageCount}, {total} items
              </span>
              <PageLink href={href({ page: page + 1 })} disabled={page >= pageCount}>
                Next
              </PageLink>
            </nav>
          )}
        </>
      )}
    </main>
  );
}

function Count({ n }: { n: number }) {
  return <span className="tabular text-xs text-ink-muted">{n}</span>;
}

function FilterLink({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`rounded-control border px-3 py-1.5 text-sm ${
        active ? "border-ink-strong bg-ink-strong text-white" : "border-line bg-surface"
      }`}
    >
      {children}
    </Link>
  );
}

function PageLink({
  href,
  disabled,
  children,
}: {
  href: string;
  disabled: boolean;
  children: React.ReactNode;
}) {
  if (disabled) {
    return (
      <span className="rounded-control border border-line px-3 py-1.5 text-ink-muted opacity-50">
        {children}
      </span>
    );
  }
  return (
    <Link href={href} className="rounded-control border border-line bg-surface px-3 py-1.5">
      {children}
    </Link>
  );
}

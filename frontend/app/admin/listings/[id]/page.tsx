"use client";

import { use, useEffect, useState } from "react";
import { AdminRecordActions } from "@/components/admin-record-actions";
import type { Check, ListingRow } from "@/lib/admin-view";

type Detail = { listing: ListingRow; images: string[]; checks: Check[] };

/**
 * One listing, and every time the checker read it.
 *
 * The sequence is what this page is for. A rejection, then a fix, then an approval is the
 * loop the product promises an owner, and a single row cannot show that it happened. Read
 * top to bottom it is the argument between an owner and an agent, in order.
 *
 * The listing is shown as the checker was given it: same words, same photographs. A finding
 * about a photograph can then be checked against the photograph rather than taken on trust.
 */
export default function AdminListingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const response = await fetch(`/api/admin?listingId=${id}`);
        if (!active) return;
        if (response.status === 401) {
          setError("Signed out. Unlock the log again from the list.");
          return;
        }
        const result = await response.json();
        if (!response.ok) throw new Error(result.error ?? "That listing could not be read.");
        setDetail(result as Detail);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "That listing could not be read.");
      }
    })();
    return () => {
      active = false;
    };
  }, [id]);

  if (error) {
    return (
      <main className="flex flex-col gap-4">
        <p className="rounded-card border border-stop-ink/30 bg-stop-bg/40 p-4 text-sm text-stop-ink">
          {error}
        </p>
      </main>
    );
  }

  if (!detail) {
    return (
      <main className="flex flex-col gap-4">
        <p className="text-sm text-ink-muted">Loading...</p>
      </main>
    );
  }

  const { listing, images, checks } = detail;

  return (
    <main className="flex max-w-4xl flex-col gap-8">
      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-3xl">{listing.title}</h1>
          <span
            className={`rounded-full px-2 py-0.5 text-xs tracking-wide uppercase ${
              listing.moderation_status === "approved"
                ? "bg-live-bg text-live-ink"
                : listing.moderation_status === "rejected"
                  ? "bg-stop-bg text-stop-ink"
                  : "bg-pend-bg text-pend-ink"
            }`}
          >
            {listing.moderation_status}
          </span>
        </div>

        <p className="whitespace-pre-wrap text-ink-muted">{listing.description}</p>

        <dl className="grid gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
          <Row label="Category" value={listing.category} />
          <Row label="Per day" value={`${listing.price_per_day} USDC`} tabular />
          <Row label="Deposit" value={`${listing.deposit} USDC`} tabular />
          <Row label="Posted" value={new Date(listing.created_at).toLocaleString()} />
        </dl>
      </header>

      {images.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-xl">The photographs it was checked with</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {images.map((url) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={url}
                src={url}
                alt="Filed with the listing"
                className="max-h-72 w-full rounded-card border border-line object-contain"
              />
            ))}
          </div>
        </section>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="text-xl">
          {checks.length === 1 ? "The check" : `${checks.length} checks, oldest first`}
        </h2>

        {checks.length === 0 ? (
          <p className="text-sm text-ink-muted">
            This listing has not been through the checker, or it went through before the
            checks were recorded.
          </p>
        ) : (
          <ol className="flex flex-col gap-3">
            {checks.map((check) => (
              <li
                key={check.id}
                className="flex flex-col gap-2 rounded-card border border-line bg-surface p-4"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-3">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs tracking-wide uppercase ${
                      check.decision === "approve"
                        ? "bg-live-bg text-live-ink"
                        : "bg-stop-bg text-stop-ink"
                    }`}
                  >
                    {check.decision === "approve" ? "published" : "refused"}
                  </span>
                  <span className="tabular text-xs text-ink-muted">
                    {check.model} · {new Date(check.created_at).toLocaleString()}
                  </span>
                </div>

                {/* What the owner was shown. A refusal they cannot act on is a refusal they
                    walk away from, so this is the half that has to be readable. */}
                {check.reasons.length > 0 && (
                  <ul className="flex flex-col gap-1 text-sm">
                    {check.reasons.map((reason, index) => (
                      <li key={index}>{reason}</li>
                    ))}
                  </ul>
                )}

                {check.findings.length > 0 && (
                  <dl className="flex flex-col gap-1 border-t border-line pt-2 text-xs">
                    {check.findings.map((finding, index) => (
                      <div key={index} className="flex gap-2">
                        <dt className="shrink-0 tracking-wide text-ink-muted uppercase">
                          {finding.from}
                        </dt>
                        <dd>{finding.says}</dd>
                      </div>
                    ))}
                  </dl>
                )}
              </li>
            ))}
          </ol>
        )}
      </section>

      <AdminRecordActions listingId={listing.id} label={listing.title} />
    </main>
  );
}

function Row({ label, value, tabular }: { label: string; value: string; tabular?: boolean }) {
  return (
    <div className="flex justify-between gap-4 border-b border-line pb-2">
      <dt className="text-ink-muted">{label}</dt>
      <dd className={tabular ? "tabular" : ""}>{value}</dd>
    </div>
  );
}


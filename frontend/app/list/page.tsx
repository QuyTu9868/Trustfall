"use client";

import { useIdentityToken, usePrivy } from "@privy-io/react-auth";
import { useEffect, useMemo, useState } from "react";
import {
  CATEGORIES,
  CATEGORY_LABELS,
  type Category,
  type FieldErrors,
  IMAGES_PER_LISTING,
  type ListingDraft,
  emptyDraft,
  formatUsdc,
  validateDraft,
  validateImages,
} from "@/lib/listing";
import { LocalPhoto } from "@/components/photo";
import { PriceHint } from "@/components/price-hint";
import { PublishedListing } from "@/components/published-listing";

/**
 * Listing flow, three steps on one route.
 *
 * One route rather than three URLs so going back a step never loses what was typed.
 * Three steps rather than Airbnb's forty: UI-REFERENCE.md section 1 is explicit that
 * copying the length of their flow would kill it, because nobody is earning a living here.
 */
type Step = 1 | 2 | 3;

export default function ListPage() {
  const { authenticated, login } = usePrivy();
  const { identityToken } = useIdentityToken();

  const [step, setStep] = useState<Step>(1);
  const [draft, setDraft] = useState<ListingDraft>(emptyDraft);
  const [files, setFiles] = useState<File[]>([]);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [publishedId, setPublishedId] = useState<string | null>(null);

  // Previews are local object URLs, so nothing is uploaded until Publish. Abandon the
  // flow at step 2 and no orphan files are left in storage.
  //
  // Derived during render rather than in an effect: setting state inside an effect just
  // to mirror other state causes a second render for no reason. The effect below only
  // cleans up, because an object URL the browser is never told to release keeps the whole
  // image in memory for the life of the tab.
  const previews = useMemo(
    () => files.map((file) => URL.createObjectURL(file)),
    [files]
  );
  useEffect(() => {
    return () => previews.forEach((url) => URL.revokeObjectURL(url));
  }, [previews]);

  if (publishedId) {
    return <PublishedListing id={publishedId} onAnother={() => resetAll()} />;
  }

  function resetAll() {
    setPublishedId(null);
    setDraft(emptyDraft);
    setFiles([]);
    setErrors({});
    setSubmitError(null);
    setStep(1);
  }

  function set<K extends keyof ListingDraft>(key: K, value: ListingDraft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
  }

  /**
   * HTML has no way to cap how many files a picker accepts: multiple means unlimited.
   * So the cap lives here. Rejecting the whole selection rather than silently keeping the
   * first two, because quietly discarding files somebody chose is worse than saying no.
   */
  function pickPhotos(picked: File[]) {
    if (picked.length > IMAGES_PER_LISTING) {
      setFiles([]);
      setErrors((c) => ({
        ...c,
        images: `You picked ${picked.length}. Choose exactly ${IMAGES_PER_LISTING}.`,
      }));
      return;
    }
    setFiles(picked);
    setErrors((c) => ({ ...c, images: undefined }));
  }

  function goToImages() {
    const found = validateDraft(draft);
    setErrors(found);
    if (Object.values(found).every((v) => !v)) setStep(2);
  }

  function goToReview() {
    const problem = validateImages(files);
    setErrors({ images: problem ?? undefined });
    if (!problem) setStep(3);
  }

  async function publish() {
    setSubmitError(null);

    // Prerequisite first: no point building a request we know will come back 401.
    if (!authenticated) {
      login();
      return;
    }

    const body = new FormData();
    body.set("category", draft.category ?? "");
    body.set("title", draft.title.trim());
    body.set("description", draft.description.trim());
    body.set("pricePerDay", draft.pricePerDay);
    body.set("deposit", draft.deposit);
    files.forEach((file) => body.append("images", file));

    setPublishing(true);
    try {
      // Privy attaches the privy-id-token cookie to this request by itself, so the
      // server can always identify the caller. The header is only a fallback for a
      // browser that refuses the cookie, which is why it is optional rather than a
      // precondition: blocking on the hook here is what produced a "try again in a
      // moment" message for a problem that no amount of waiting could fix.
      const response = await fetch("/api/listings", {
        method: "POST",
        headers: identityToken ? { "privy-id-token": identityToken } : undefined,
        body,
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Could not publish.");
      setPublishedId(result.id);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Could not publish.");
    } finally {
      setPublishing(false);
    }
  }

  return (
    <main className="flex max-w-2xl flex-col gap-8">
      <header className="flex flex-col gap-3">
        <h1 className="text-3xl">List an item</h1>
        <Steps current={step} />
      </header>

      {step === 1 && (
        <section className="flex flex-col gap-5">
          <Field label="Category" error={errors.category}>
            <div className="flex gap-2">
              {CATEGORIES.map((category) => (
                <button
                  key={category}
                  onClick={() => set("category", category as Category)}
                  className={`rounded-control border px-3 py-1.5 text-sm ${
                    draft.category === category
                      ? "border-ink-strong bg-ink-strong text-white"
                      : "border-line bg-surface"
                  }`}
                >
                  {CATEGORY_LABELS[category]}
                </button>
              ))}
            </div>
          </Field>

          <Field label="Title" error={errors.title}>
            <input
              value={draft.title}
              onChange={(e) => set("title", e.target.value)}
              placeholder="Honda Wave 110, 2019"
              className="w-full rounded-control border border-line bg-surface px-3 py-2 text-sm"
            />
          </Field>

          <Field
            label="Description"
            error={errors.description}
            hint="What it is, what condition it is in, anything a renter should know before they commit."
          >
            <textarea
              value={draft.description}
              onChange={(e) => set("description", e.target.value)}
              rows={5}
              className="w-full rounded-control border border-line bg-surface px-3 py-2 text-sm"
            />
          </Field>

          <div className="flex gap-4">
            <Field label="Price per day" error={errors.pricePerDay}>
              <Money
                value={draft.pricePerDay}
                onChange={(v) => set("pricePerDay", v)}
              />
              <PriceHint category={draft.category} />
            </Field>
            <Field
              label="Deposit"
              error={errors.deposit}
              hint="Refunded when the item comes back."
            >
              <Money value={draft.deposit} onChange={(v) => set("deposit", v)} />
            </Field>
          </div>

          <Actions onNext={goToImages} nextLabel="Add photos" />
        </section>
      )}

      {step === 2 && (
        <section className="flex flex-col gap-5">
          <Field
            label={`Photos (${IMAGES_PER_LISTING} required)`}
            error={errors.images}
            hint="JPG, PNG or WebP, under 5MB each. Nothing uploads until you publish."
          >
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              onChange={(e) => pickPhotos(Array.from(e.target.files ?? []))}
              className="w-full rounded-control border border-line bg-surface px-3 py-2 text-sm"
            />
          </Field>

          {previews.length > 0 && (
            <div className="grid grid-cols-2 gap-3">
              {previews.map((url, index) => (
                <LocalPhoto key={url} src={url} alt={`Photo ${index + 1}`} />
              ))}
            </div>
          )}

          <p className="text-xs text-ink-muted">
            An agent will check listings automatically from checkpoint 9. For now nothing
            reviews them, and every listing is marked pending.
          </p>

          <Actions
            onBack={() => setStep(1)}
            onNext={goToReview}
            nextLabel="Review"
          />
        </section>
      )}

      {step === 3 && (
        <section className="flex flex-col gap-5">
          <div className="rounded-card border border-line bg-surface">
            <dl className="divide-y divide-line text-sm">
              <Row label="Category">
                {draft.category ? CATEGORY_LABELS[draft.category] : "-"}
              </Row>
              <Row label="Title">{draft.title}</Row>
              <Row label="Price per day">
                <span className="tabular">{formatUsdc(draft.pricePerDay)} USDC</span>
              </Row>
              <Row label="Deposit">
                <span className="tabular">{formatUsdc(draft.deposit)} USDC</span>
              </Row>
            </dl>
            <div className="border-t border-line p-4">
              <p className="text-sm whitespace-pre-wrap">{draft.description}</p>
              <div className="mt-4 grid grid-cols-2 gap-3">
                {previews.map((url, index) => (
                  <LocalPhoto key={url} src={url} alt={`Photo ${index + 1}`} />
                ))}
              </div>
            </div>
          </div>

          {submitError && <p className="text-xs text-stop-ink">{submitError}</p>}

          <Actions
            onBack={() => setStep(2)}
            onNext={publish}
            nextLabel={
              !authenticated
                ? "Sign in to publish"
                : publishing
                  ? "Publishing..."
                  : "Publish"
            }
            disabled={publishing}
          />
        </section>
      )}
    </main>
  );
}

function Steps({ current }: { current: Step }) {
  const labels = ["Details", "Photos", "Review"];
  return (
    <ol className="flex items-center gap-3 text-xs">
      {labels.map((label, index) => {
        const number = (index + 1) as Step;
        const done = number < current;
        return (
          <li key={label} className="flex items-center gap-3">
            <span className={number === current ? "text-ink-strong" : "text-ink-muted"}>
              <span className="tabular">{number}</span> {label}
            </span>
            {index < labels.length - 1 && (
              <span className={done ? "text-ink-strong" : "text-line"} aria-hidden>
                &mdash;
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}

function Field({
  label,
  error,
  hint,
  children,
}: {
  label: string;
  error?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex w-full flex-col gap-1.5">
      <span className="text-sm">{label}</span>
      {children}
      {hint && !error && <span className="text-xs text-ink-muted">{hint}</span>}
      {error && <span className="text-xs text-stop-ink">{error}</span>}
    </label>
  );
}

function Money({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex w-fit items-center gap-2 rounded-control border border-line bg-surface px-3">
      <input
        type="number"
        min="0"
        step="0.01"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="0.00"
        className="tabular w-20 bg-transparent py-2 text-sm outline-none"
      />
      <span className="text-xs text-ink-muted">USDC</span>
    </div>
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

function Actions({
  onBack,
  onNext,
  nextLabel,
  disabled,
}: {
  onBack?: () => void;
  onNext: () => void;
  nextLabel: string;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center gap-3">
      {onBack && (
        <button
          onClick={onBack}
          className="rounded-control border border-line px-4 py-2 text-sm"
        >
          Back
        </button>
      )}
      <button
        onClick={onNext}
        disabled={disabled}
        className="rounded-control bg-ink-strong px-4 py-2 text-sm text-white active:scale-[0.98] disabled:opacity-50"
      >
        {nextLabel}
      </button>
    </div>
  );
}

"use client";

import { useIdentityToken, usePrivy } from "@privy-io/react-auth";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
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
import { type Moderation, ModerationResult } from "@/components/moderation-result";
import { LocalPhoto } from "@/components/photo";
import { PriceHint } from "@/components/price-hint";
import { PublishedListing } from "@/components/published-listing";
import { downscale } from "@/lib/downscale";

/**
 * Listing flow, three steps on one route.
 *
 * One route rather than three URLs so going back a step never loses what was typed.
 * Three steps rather than Airbnb's forty: UI-REFERENCE.md section 1 is explicit that
 * copying the length of their flow would kill it, because nobody is earning a living here.
 */
type Step = 1 | 2 | 3;

/**
 * The flow reads ?edit= to tell writing a new listing from fixing an existing one, and
 * useSearchParams forces whatever contains it to render on the client. Without this
 * boundary the build fails trying to prerender the page, so the wrapper is here to hold
 * the line between the static shell and the part that has to wait for the URL.
 */
export default function ListPage() {
  return (
    <Suspense fallback={<p className="text-sm text-ink-muted">Loading...</p>}>
      <ListFlow />
    </Suspense>
  );
}

function ListFlow() {
  const { authenticated, login } = usePrivy();
  const { identityToken } = useIdentityToken();

  // Editing a listing that already exists rather than writing a new one. Same three steps
  // and the same fields, because a second form that drifts from the first is how the two
  // start disagreeing about what a valid listing is.
  const editId = useSearchParams().get("edit");
  const [loadingDraft, setLoadingDraft] = useState(Boolean(editId));

  const [step, setStep] = useState<Step>(1);
  const [draft, setDraft] = useState<ListingDraft>(emptyDraft);
  const [files, setFiles] = useState<File[]>([]);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [publishedId, setPublishedId] = useState<string | null>(null);
  const [moderation, setModeration] = useState<Moderation>({ state: "idle" });

  // Photos stay as they are when editing. A rejection nearly always names something in
  // the words, and making somebody re-upload two files to fix a sentence is how they give
  // up instead. Wrong photos are handled by deleting the listing and starting again.
  useEffect(() => {
    if (!editId || !authenticated) return;
    let active = true;

    void (async () => {
      try {
        const response = await fetch("/api/listings/mine");
        if (!response.ok) return;
        const result = await response.json();
        const found = (result.listings as { id: string }[]).find((row) => row.id === editId) as
          | {
              category: string;
              title: string;
              description: string;
              price_per_day: string;
              deposit: string;
            }
          | undefined;
        if (!found || !active) return;

        setDraft({
          category: found.category as Category,
          title: found.title,
          description: found.description,
          pricePerDay: String(Number(found.price_per_day)),
          deposit: String(Number(found.deposit)),
        });
      } finally {
        if (active) setLoadingDraft(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [editId, authenticated]);

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

  if (loadingDraft) {
    return <p className="text-sm text-ink-muted">Loading the listing...</p>;
  }

  function resetAll() {
    setPublishedId(null);
    setDraft(emptyDraft);
    setFiles([]);
    setErrors({});
    setSubmitError(null);
    setModeration({ state: "idle" });
    setStep(1);
  }

  function set<K extends keyof ListingDraft>(key: K, value: ListingDraft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
    // A verdict belongs to the words it was given. Change one and the old answer is about
    // a listing that no longer exists, so it stops being shown.
    setModeration({ state: "idle" });
  }

  /**
   * HTML has no way to cap how many files a picker accepts: multiple means unlimited.
   * So the cap lives here. Rejecting the whole selection rather than silently keeping the
   * first two, because quietly discarding files somebody chose is worse than saying no.
   */
  async function pickPhotos(picked: File[]) {
    setModeration({ state: "idle" });
    if (picked.length > IMAGES_PER_LISTING) {
      setFiles([]);
      setErrors((c) => ({
        ...c,
        images: `You picked ${picked.length}. Choose exactly ${IMAGES_PER_LISTING}.`,
      }));
      return;
    }
    // Shrunk here, once, so the same smaller file is what gets checked, uploaded and
    // later served. A phone photo is several megabytes and pays for that three times.
    setFiles(await Promise.all(picked.map(downscale)));
    setErrors((c) => ({ ...c, images: undefined }));
  }

  function goToImages() {
    const found = validateDraft(draft);
    setErrors(found);
    if (Object.values(found).every((v) => !v)) setStep(2);
  }

  /**
   * Checks before letting the flow move on, so a rejection lands while the draft is still
   * on screen and editable rather than at the moment somebody presses publish.
   *
   * This is a courtesy, not the gate. The publish route runs the same check and is the
   * one that actually stops anything.
   */
  async function checkThenReview() {
    // Editing keeps the stored photos, so there is nothing to validate and nothing to send
    // for a preview: the real check runs on save, against those same pictures.
    if (editId) {
      setStep(3);
      return;
    }

    const problem = validateImages(files);
    setErrors({ images: problem ?? undefined });
    if (problem) return;

    setModeration({ state: "checking" });
    try {
      const body = new FormData();
      body.set("title", draft.title.trim());
      body.set("description", draft.description.trim());
      files.forEach((file) => body.append("images", file));

      const response = await fetch("/api/moderate", {
        method: "POST",
        headers: identityToken ? { "privy-id-token": identityToken } : undefined,
        body,
      });
      const result = await response.json();

      if (response.status === 503) {
        setModeration({ state: "unavailable", message: result.error });
        return;
      }
      if (!response.ok) {
        setModeration({ state: "reject", reasons: [result.error ?? "Could not check this."] });
        return;
      }
      if (result.decision === "reject") {
        setModeration({ state: "reject", reasons: result.reasons });
        return;
      }

      setModeration({ state: result.bypassed ? "bypassed" : "approve" });
      setStep(3);
    } catch {
      setModeration({ state: "unavailable", message: "The check could not be sent." });
    }
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
      const response = await fetch(editId ? `/api/listings/${editId}` : "/api/listings", {
        method: editId ? "PATCH" : "POST",
        headers: identityToken ? { "privy-id-token": identityToken } : undefined,
        body,
      });
      const result = await response.json();

      // The publish route runs the same check. It can disagree with step 2 when the draft
      // changed after it passed, so the reasons are shown the same way here rather than
      // flattened into a one line error that says nothing actionable.
      // Saved either way. A rejection now leaves a real listing sitting at "not accepted"
      // on the owner's own page rather than a draft that vanishes with the tab, so this
      // says what changed and where it went.
      if (response.status === 422) {
        setModeration({ state: "reject", reasons: result.reasons ?? [] });
        setStep(2);
        return;
      }
      if (response.status === 503) {
        setModeration({ state: "unavailable", message: result.error });
        setStep(2);
        return;
      }
      if (!response.ok) throw new Error(result.error ?? "Could not publish.");
      setPublishedId(result.id);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Could not publish.");
    } finally {
      setPublishing(false);
    }
  }

  return (
    <main className="flex max-w-3xl flex-col gap-8">
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
                      ? "border-ink-strong bg-ink-strong text-canvas"
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
            {/* The native file input draws its own button and label in the browser's
                language, which put Vietnamese in the middle of an English page. There is
                no attribute that changes that text, so the input is hidden and this label
                stands in for it: clicking a label still opens the picker. */}
            <label className="flex w-full cursor-pointer items-center justify-between gap-3 rounded-control border border-line bg-surface px-3 py-2 text-sm">
              <span className={files.length > 0 ? undefined : "text-ink-muted"}>
                {files.length === 0
                  ? "No photos chosen yet"
                  : `${files.length} of ${IMAGES_PER_LISTING} chosen`}
              </span>
              <span className="rounded-control border border-line px-3 py-1 text-xs">
                {files.length === 0 ? "Choose photos" : "Change"}
              </span>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                multiple
                onChange={(e) => pickPhotos(Array.from(e.target.files ?? []))}
                className="hidden"
              />
            </label>
          </Field>

          {previews.length > 0 && (
            <div className="grid grid-cols-2 gap-3">
              {previews.map((url, index) => (
                <LocalPhoto key={url} src={url} alt={`Photo ${index + 1}`} />
              ))}
            </div>
          )}

          <p className="text-xs text-ink-muted">
            Listings are checked automatically before they go live. Nothing is uploaded
            until you publish.
          </p>

          <ModerationResult result={moderation} />

          <Actions
            onBack={() => setStep(1)}
            onNext={checkThenReview}
            nextLabel={moderation.state === "checking" ? "Checking..." : "Check and review"}
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
              /* A rule, not an em dash. Same reason as the rental status strip. */
              <span
                className={`h-px w-5 ${done ? "bg-ink-strong" : "bg-line"}`}
                aria-hidden
              />
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
        className="rounded-control bg-ink-strong px-4 py-2 text-sm text-canvas active:scale-[0.98] disabled:opacity-50"
      >
        {nextLabel}
      </button>
    </div>
  );
}

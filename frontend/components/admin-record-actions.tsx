"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * The delete control, and the sentence explaining what it does not do.
 *
 * Kept on the detail page rather than as a button in the list. A destructive action beside
 * five other rows is one misread away from removing the wrong one, and there is no undo:
 * these rows are the only copy of the arbitrator's reasoning, and the photographs go with
 * them.
 *
 * Two presses, and the second one says the number out loud. Not friction for its own sake,
 * it is the same reason a bank asks you to retype an account number.
 */
export function AdminRecordActions({
  rentalId,
  listingId,
  label,
}: {
  rentalId?: number;
  listingId?: string;
  label: string;
}) {
  const router = useRouter();
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [edits, setEdits] = useState<Record<string, string>>({});
  // Asked for at the moment of acting, never stored. A session proves somebody signed in
  // two hours ago; this proves they are holding the authenticator now, which is the thing a
  // copied cookie cannot produce.
  const [code, setCode] = useState("");

  const remove = async () => {
    setBusy(true);
    setError(null);
    try {
      const query =
        (rentalId ? `rentalId=${rentalId}` : `listingId=${listingId}`) + `&code=${encodeURIComponent(code)}`;
      const response = await fetch(`/api/admin/records?${query}`, { method: "DELETE" });
      const result = await response.json();
      if (!response.ok) {
        setError(result.error ?? "That did not work.");
        setBusy(false);
        return;
      }
      router.push(rentalId ? "/admin" : "/admin/listings");
      router.refresh();
    } catch {
      setError("Could not reach the server.");
      setBusy(false);
    }
  };

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/records", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ listingId, code, ...edits }),
      });
      const result = await response.json();
      if (!response.ok) setError(result.error ?? "That did not work.");
      else {
        setEditing(false);
        router.refresh();
      }
    } catch {
      setError("Could not reach the server.");
    }
    setBusy(false);
  };

  return (
    <section className="flex flex-col gap-3 rounded-card border border-line border-dashed p-4">
      {/* Only listings. A rental's price, deposit and dates were arguments to a transaction
          that is already mined, so editing them here would only make this page disagree with
          the chain. */}
      {listingId ? (
        editing ? (
          <div className="flex flex-col gap-2">
            {(["title", "description", "price_per_day", "deposit"] as const).map((field) => (
              <label key={field} className="flex flex-col gap-1 text-xs text-ink-muted">
                {field.replace(/_/g, " ")}
                <input
                  value={edits[field] ?? ""}
                  onChange={(event) =>
                    setEdits((previous) => ({ ...previous, [field]: event.target.value }))
                  }
                  placeholder="leave blank to keep"
                  className="rounded-card border border-line bg-surface px-2 py-1 text-sm text-ink"
                />
              </label>
            ))}
            <label className="flex flex-col gap-1 text-xs text-ink-muted">
              authenticator code
              <input
                value={code}
                onChange={(event) => setCode(event.target.value)}
                inputMode="numeric"
                className="tabular w-32 rounded-card border border-line bg-surface px-2 py-1 text-sm text-ink"
              />
            </label>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={save}
                disabled={busy}
                className="rounded-card border border-line px-3 py-1.5 text-sm disabled:opacity-50"
              >
                {busy ? "Saving" : "Save"}
              </button>
              <button
                type="button"
                onClick={() => setEditing(false)}
                className="text-sm text-ink-muted underline decoration-line underline-offset-4"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="self-start rounded-card border border-line px-3 py-1.5 text-sm"
          >
            Edit listing
          </button>
        )
      ) : null}

      <div className="flex flex-col gap-1">
        <h2 className="text-sm">Remove this record</h2>
        <p className="text-xs text-ink-muted">
          {rentalId ? (
            <>
              Deletes Trustfall&rsquo;s account of the dispute: the ruling, both statements,
              every photograph, and the conversation.{" "}
              <strong className="text-ink">
                Rental #{rentalId} stays on the contract exactly as it is.
              </strong>{" "}
              The deposit does not move, the settlement is not reversed, and anybody with the
              rental id can still read all of it on Sepolia. What goes is the filing, not the
              fact.
            </>
          ) : (
            <>
              Deletes the listing, its photographs and its moderation history. Any rental
              already made against it stays on the contract and keeps working; the page it
              came from is what disappears.
            </>
          )}
        </p>
      </div>

      {error ? <p className="text-xs text-pend-ink">{error}</p> : null}

      {armed ? (
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm">Delete {label}? This cannot be undone.</span>
          <input
            value={code}
            onChange={(event) => setCode(event.target.value)}
            placeholder="code"
            inputMode="numeric"
            className="tabular w-24 rounded-card border border-line bg-surface px-2 py-1 text-sm text-ink"
          />
          <button
            type="button"
            onClick={remove}
            disabled={busy}
            className="rounded-card bg-pend-bg px-3 py-1.5 text-sm text-pend-ink disabled:opacity-50"
          >
            {busy ? "Deleting" : "Yes, delete it"}
          </button>
          <button
            type="button"
            onClick={() => setArmed(false)}
            disabled={busy}
            className="text-sm text-ink-muted underline decoration-line underline-offset-4"
          >
            Keep it
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setArmed(true)}
          className="self-start rounded-card border border-line px-3 py-1.5 text-sm"
        >
          Delete
        </button>
      )}
    </section>
  );
}

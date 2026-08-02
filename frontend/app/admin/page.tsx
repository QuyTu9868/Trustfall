"use client";

import { useEffect, useState } from "react";

type Verdict = {
  onchain_rental_id: number;
  verdict: "refund_renter" | "split" | "pay_owner";
  confidence: number;
  reason: string;
  signed: boolean;
  tx_hash: string | null;
  held_back_reason: string | null;
  model: string;
  created_at: string;
};

const OUTCOME: Record<Verdict["verdict"], string> = {
  refund_renter: "deposit to the renter",
  split: "deposit split",
  pay_owner: "deposit to the owner",
};

/**
 * What the arbitrator decided, and whether the server acted on it.
 *
 * Read only, deliberately. The contract already has a human resolver and that power lives
 * in a wallet key, not behind a web form: a page that could move a deposit would be a page
 * worth attacking, and this one is only worth reading.
 *
 * Behind a six digit code because it shows other people's disputes. It is not the thing
 * protecting the money, which is why a code is enough.
 */
export default function AdminPage() {
  const [verdicts, setVerdicts] = useState<Verdict[] | null>(null);
  const [locked, setLocked] = useState(true);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [reloads, setReloads] = useState(0);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const response = await fetch("/api/admin");
        if (!active) return;
        if (response.status === 401) {
          setLocked(true);
          return;
        }
        const result = await response.json();
        setLocked(false);
        setVerdicts(result.verdicts as Verdict[]);
      } catch {
        // Leaves it locked, which is the safe way to be wrong.
      }
    })();
    return () => {
      active = false;
    };
  }, [reloads]);

  async function signIn() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/admin", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "That did not work.");
      setCode("");
      setReloads((count) => count + 1);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "That did not work.");
    } finally {
      setBusy(false);
    }
  }

  if (locked) {
    return (
      <main className="flex max-w-sm flex-col gap-4">
        <h1 className="text-3xl">Admin</h1>
        <p className="text-sm text-ink-muted">
          Six digits from your authenticator app.
        </p>
        <input
          value={code}
          onChange={(event) => setCode(event.target.value)}
          onKeyDown={(event) => event.key === "Enter" && signIn()}
          inputMode="numeric"
          maxLength={6}
          placeholder="000000"
          className="tabular w-40 rounded-control border border-line bg-surface px-3 py-2 text-lg tracking-widest"
        />
        <button
          onClick={signIn}
          disabled={busy || code.length < 6}
          className="w-fit rounded-control bg-ink-strong px-4 py-2 text-sm text-white disabled:opacity-40"
        >
          {busy ? "Checking..." : "Unlock"}
        </button>
        {error && <p className="text-xs text-stop-ink">{error}</p>}
      </main>
    );
  }

  return (
    <main className="flex max-w-[76rem] flex-col gap-6">
      <header className="flex flex-wrap items-baseline justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-3xl">What the arbitrator did</h1>
          <p className="text-sm text-ink-muted">
            Every verdict it reached, including the ones the server refused to act on.
          </p>
        </div>
        <button
          onClick={async () => {
            await fetch("/api/admin", { method: "DELETE" });
            setLocked(true);
          }}
          className="rounded-control border border-line px-3 py-2 text-sm"
        >
          Lock
        </button>
      </header>

      {verdicts === null && <p className="text-sm text-ink-muted">Loading...</p>}
      {verdicts?.length === 0 && (
        <p className="text-sm text-ink-muted">No disputes have been judged yet.</p>
      )}

      {verdicts?.map((entry) => (
        <article
          key={entry.onchain_rental_id}
          className="flex flex-col gap-2 rounded-card border border-line bg-surface p-5"
        >
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <span className="flex items-center gap-3">
              <span className="tabular text-sm">Rental #{entry.onchain_rental_id}</span>
              <span
                className={`rounded-full px-2 py-0.5 text-xs tracking-wide uppercase ${
                  entry.signed ? "bg-live-bg text-live-ink" : "bg-pend-bg text-pend-ink"
                }`}
              >
                {entry.signed ? "applied" : "held back"}
              </span>
            </span>
            <span className="tabular text-xs text-ink-muted">
              {new Date(entry.created_at).toLocaleString()}
            </span>
          </div>

          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm">
            <span>{OUTCOME[entry.verdict]}</span>
            <span className="tabular text-xs text-ink-muted">
              confidence {entry.confidence} · {entry.model}
            </span>
          </div>

          <p className="text-sm text-ink-muted">{entry.reason}</p>

          {/* The two facts that matter most to somebody auditing this: whether money
              actually moved, and if not, why the server declined to move it. */}
          {entry.signed ? (
            <span className="tabular text-[11px] break-all text-live-ink">{entry.tx_hash}</span>
          ) : (
            <span className="text-xs text-pend-ink">{entry.held_back_reason}</span>
          )}
        </article>
      ))}
    </main>
  );
}

"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { OUTCOME, type Verdict } from "@/lib/admin-view";

/**
 * Every ruling the arbitrator reached, one line each.
 *
 * A table rather than a stack of cards, because the question this page answers is "what has
 * it been doing", and that is a question about the shape of a hundred rows: how often it is
 * sure, how often the server declined to act, whether one outcome dominates. The evidence
 * behind any single ruling is a click away rather than in the way.
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
        // An error body has no verdicts key, and assigning undefined used to render an
        // entirely blank page: not the list, not the empty state, not even the spinner,
        // because undefined matched none of those three checks. A page that says nothing
        // reads as "the agent has done nothing", which is the one thing it did not mean.
        if (!Array.isArray(result.verdicts)) {
          throw new Error(result.error ?? "The log could not be read.");
        }
        setVerdicts(result.verdicts as Verdict[]);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "The log could not be read.");
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
        <p className="text-sm text-ink-muted">Six digits from your authenticator app.</p>
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
          className="w-fit rounded-control bg-ink-strong px-4 py-2 text-sm text-canvas disabled:opacity-40"
        >
          {busy ? "Checking..." : "Unlock"}
        </button>
        {error && <p className="text-xs text-stop-ink">{error}</p>}
      </main>
    );
  }

  const held = verdicts?.filter((entry) => !entry.signed).length ?? 0;

  return (
    <main className="flex flex-col gap-6">
      <header className="flex flex-wrap items-baseline justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-3xl">What the arbitrator did</h1>
          <p className="text-sm text-ink-muted">
            {verdicts
              ? `${verdicts.length} ruling${verdicts.length === 1 ? "" : "s"}, ${held} the server refused to act on.`
              : "Every verdict it reached, including the ones the server refused to act on."}
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

      {error && (
        <p className="rounded-card border border-stop-ink/30 bg-stop-bg/40 p-4 text-sm text-stop-ink">
          {error}
        </p>
      )}
      {verdicts === null && !error && <p className="text-sm text-ink-muted">Loading...</p>}
      {verdicts?.length === 0 && (
        <p className="text-sm text-ink-muted">No disputes have been judged yet.</p>
      )}

      {verdicts && verdicts.length > 0 && (
        <div className="overflow-x-auto rounded-card border border-line bg-surface">
          <table className="w-full min-w-[46rem] text-sm">
            <thead className="border-b border-line text-left text-xs text-ink-muted">
              <tr>
                <th className="px-4 py-3 font-normal">Rental</th>
                <th className="px-4 py-3 font-normal">Outcome</th>
                <th className="px-4 py-3 font-normal">Confidence</th>
                <th className="px-4 py-3 font-normal">Acted on</th>
                <th className="px-4 py-3 font-normal">Reason</th>
                <th className="px-4 py-3 font-normal">When</th>
              </tr>
            </thead>
            <tbody>
              {verdicts.map((entry) => (
                <tr key={entry.onchain_rental_id} className="border-b border-line last:border-0">
                  <td className="px-4 py-3">
                    {/* The link is on the id rather than on the whole row, which would make
                        selecting the reason text impossible. */}
                    <Link
                      href={`/admin/${entry.onchain_rental_id}`}
                      className="tabular underline decoration-line underline-offset-4"
                    >
                      #{entry.onchain_rental_id}
                    </Link>
                  </td>
                  <td className="px-4 py-3">{OUTCOME[entry.verdict]}</td>
                  <td className="tabular px-4 py-3">{entry.confidence.toFixed(2)}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs tracking-wide uppercase ${
                        entry.signed ? "bg-live-bg text-live-ink" : "bg-pend-bg text-pend-ink"
                      }`}
                    >
                      {entry.signed ? "applied" : "held back"}
                    </span>
                  </td>
                  <td className="max-w-md px-4 py-3 text-ink-muted">{entry.reason}</td>
                  <td className="tabular px-4 py-3 text-xs text-ink-muted">
                    {new Date(entry.created_at).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}

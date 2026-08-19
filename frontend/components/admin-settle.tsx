"use client";

import { useState } from "react";
import { OUTCOME, type Verdict } from "@/lib/admin-view";

const CHOICES: Verdict["verdict"][] = ["refund_renter", "split", "pay_owner"];

/**
 * Deciding the one dispute the arbitrator could not.
 *
 * Rendered only for a ruling the server refused to act on. There is deliberately no version
 * of this for a dispute that was decided and signed: that one is closed to everybody,
 * including whoever is reading this page, and a button that existed but always failed would
 * be worse than no button.
 *
 * A code and a sentence, both required. The code because a session cookie validates itself
 * and cannot be revoked, so every call that moves money asks again. The sentence because
 * this is the only decision in the app with no model behind it to explain itself, and a
 * deposit that moved for reasons nobody wrote down is the thing the whole log exists to
 * prevent.
 */
export function AdminSettle({ rentalId, onDone }: { rentalId: number; onDone: () => void }) {
  const [choice, setChoice] = useState<Verdict["verdict"] | null>(null);
  const [note, setNote] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function settle() {
    if (!choice || busy) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/resolve", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ rentalId, verdict: choice, note: note.trim(), code }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "That did not go through.");
      setCode("");
      setNote("");
      setChoice(null);
      onDone();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "That did not go through.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="flex flex-col gap-4 rounded-card border border-pend-ink/30 bg-pend-bg/40 p-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-xl">Decide it yourself</h2>
        <p className="text-sm text-ink-muted">
          The arbitrator reached this and the server would not act on it, so nothing has
          moved and nothing will until somebody does something. Left alone, seven days after
          the dispute opened anyone can close it and the deposit goes to the renter.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {CHOICES.map((option) => (
          <button
            key={option}
            onClick={() => setChoice(option)}
            className={`rounded-control border px-3 py-2 text-sm ${
              choice === option
                ? "border-ink-strong bg-ink-strong text-canvas"
                : "border-line bg-surface"
            }`}
          >
            {OUTCOME[option]}
          </button>
        ))}
      </div>

      <textarea
        value={note}
        onChange={(event) => setNote(event.target.value)}
        rows={2}
        maxLength={500}
        placeholder="Why. This goes in the log beside the arbitrator's own reason, and it does not replace it."
        className="rounded-control border border-line bg-surface px-3 py-2 text-sm"
      />

      <div className="flex flex-wrap items-center gap-2">
        <input
          value={code}
          onChange={(event) => setCode(event.target.value)}
          inputMode="numeric"
          maxLength={6}
          placeholder="000000"
          className="tabular w-28 rounded-control border border-line bg-surface px-3 py-2 text-sm tracking-widest"
        />
        <button
          onClick={settle}
          disabled={busy || !choice || note.trim().length === 0 || code.length < 6}
          className="rounded-control bg-ink-strong px-4 py-2 text-sm text-canvas disabled:opacity-40"
        >
          {busy ? "Signing..." : "Sign this outcome"}
        </button>
        <span className="text-xs text-ink-muted">
          Moves the deposit for real. The code is checked again, live.
        </span>
      </div>

      {error && <p className="text-xs text-stop-ink">{error}</p>}
    </section>
  );
}

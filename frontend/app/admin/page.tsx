"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  GATEWAY_LABEL,
  OUTCOME,
  type Check,
  type Pending,
  type Verdict,
} from "@/lib/admin-view";

/**
 * Every ruling the arbitrator reached, one line each.
 *
 * A table rather than a stack of cards, because the question this page answers is "what has
 * it been doing", and that is a question about the shape of a hundred rows: how often it is
 * sure, how often the server declined to act, whether one outcome dominates. The evidence
 * behind any single ruling is a click away rather than in the way.
 *
 * Read only, and there is nothing for it to be otherwise. Only the agent's address can
 * settle a dispute on chain, so there is no verdict for a person to enter here and no
 * button worth attacking. This page reads a record; it does not have a lever.
 *
 * Behind a six digit code because it shows other people's disputes. It is not the thing
 * protecting the money, which is why a code is enough.
 */
export default function AdminPage() {
  const [verdicts, setVerdicts] = useState<Verdict[] | null>(null);
  const [pending, setPending] = useState<Pending[]>([]);
  const [checks, setChecks] = useState<Check[]>([]);
  const [locked, setLocked] = useState(true);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [reloads, setReloads] = useState(0);
  const router = useRouter();

  useEffect(() => {
    let active = true;

    const load = async () => {
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
        setPending((result.pending ?? []) as Pending[]);
        setChecks((result.checks ?? []) as Check[]);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "The log could not be read.");
      }
    };

    void load();
    // Slow, because a ruling only appears when somebody files the second statement, and
    // the alternative is a page that quietly goes stale while an agent is working.
    // Nothing while the tab is hidden. A bare setInterval keeps firing behind another
    // window, on a minimised browser, and with the lid shut, and each of these polls makes
    // the server read the contract on its behalf. Measured at roughly 35,000 chain reads a
    // day from one rental page nobody was looking at.
    //
    // Firing on visibilitychange as well, so coming back to the window refreshes it at once
    // rather than up to one interval later. That was the reason background polling got
    // turned on in the first place, and this buys it for nothing.
    const tick = () => {
      if (!document.hidden) void load();
    };
    const timer = setInterval(tick, 8000);
    document.addEventListener("visibilitychange", tick);
    return () => {
      active = false;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
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
    <main className="flex flex-col gap-8">
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

      {/* Filed but not judged yet: there is no verdict row for these, so they would
          otherwise be invisible until the arbitrator finishes. Shown here mostly so a
          dispute in progress does not read as nothing happening. */}
      {pending.length > 0 && (
        <div className="flex flex-col gap-2">
          {pending.map((entry) => (
            <Link
              key={entry.onchain_rental_id}
              href={`/rentals/${entry.onchain_rental_id}`}
              className="flex items-center gap-3 rounded-card border border-line bg-surface p-3 text-sm transition-colors hover:bg-canvas"
            >
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-pend-ink opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-pend-ink" />
              </span>
              <span className="tabular">Rental #{entry.onchain_rental_id}</span>
              <span className="text-ink-muted">
                the arbitrator is reading it, filed {new Date(entry.filed_at).toLocaleString()}
              </span>
            </Link>
          ))}
        </div>
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
                <th className="px-4 py-3 font-normal">Gateway</th>
                <th className="px-4 py-3 font-normal">Acted on</th>
                <th className="px-4 py-3 font-normal">Reason</th>
                <th className="px-4 py-3 font-normal">When</th>
              </tr>
            </thead>
            <tbody>
              {verdicts.map((entry) => (
                /* The whole row navigates, because a target two characters wide is a target
                   people miss. The id underneath stays a real link so the keyboard and the
                   middle mouse button still work, which an onClick alone would take away. */
                <tr
                  key={entry.onchain_rental_id}
                  onClick={() => router.push(`/admin/${entry.onchain_rental_id}`)}
                  className="cursor-pointer border-b border-line transition-colors last:border-0 hover:bg-canvas"
                >
                  <td className="px-4 py-3">
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
                    {/* Every proposal here leaves the app over HTTP and passes a Latch
                        policy before the server will act on it. This is the one place that
                        says so: null on anything ruled before this was tracked, "cleared"
                        on a proposal the policy let through, "refused" on one it stopped
                        before the confidence bar downstream ever ran. */}
                    {entry.gateway ? (
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs tracking-wide uppercase ${
                          entry.gateway === "blocked"
                            ? "bg-stop-bg text-stop-ink"
                            : entry.gateway === "passed"
                              ? "bg-okay-bg text-okay-ink"
                              : "bg-pend-bg text-pend-ink"
                        }`}
                      >
                        {GATEWAY_LABEL[entry.gateway]}
                      </span>
                    ) : (
                      <span className="text-xs text-ink-muted">not recorded</span>
                    )}
                  </td>
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

      {/* The other agent, and the one that runs far more often. It moves no money, which is
          why it is second, and it decides who gets to trade here, which is why it is on the
          same page rather than out of sight. */}
      <section className="flex flex-col gap-3 pt-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-2xl">What the listing checker did</h2>
          <p className="text-sm text-ink-muted">
            Every listing read before it went live, and what the checker saw in it.
          </p>
        </div>

        {checks.length === 0 ? (
          <p className="text-sm text-ink-muted">
            No listings have been checked yet, or migration 010 has not been run.
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            {checks.map((check) => (
              /* The whole card is the link, not the title. A card that looks clickable and
                 only is in one corner is worse than one that is not clickable at all. */
              <Wrap key={check.id} href={check.listing_id ? `/admin/listings/${check.listing_id}` : null}>
                <div className="flex flex-wrap items-baseline justify-between gap-3">
                  <span className="flex items-center gap-3">
                    <span className="text-sm">
                      {check.listing_id ? (check.title ?? "Untitled") : "A listing since deleted"}
                    </span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs tracking-wide uppercase ${
                        check.decision === "approve"
                          ? "bg-live-bg text-live-ink"
                          : "bg-stop-bg text-stop-ink"
                      }`}
                    >
                      {check.decision === "approve" ? "published" : "refused"}
                    </span>
                  </span>
                  <span className="tabular text-xs text-ink-muted">
                    {new Date(check.created_at).toLocaleString()}
                  </span>
                </div>

                {/* What the owner was shown. A refusal they cannot act on is a refusal they
                    walk away from, so this is the half that has to be readable. */}
                {check.reasons.length > 0 && (
                  <ul className="flex flex-col gap-1 text-sm text-ink-muted">
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
              </Wrap>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

/**
 * A card that is a link when there is somewhere to go, and a plain card when there is not.
 *
 * Written out rather than wrapped conditionally at the call site, because the two branches
 * have to keep the same padding, border and radius. When they drift, one kind of card sits
 * a pixel out from the other and nobody can say why.
 *
 * The lift on hover is the one piece of movement in the app. UI-REFERENCE.md section 5
 * rules motion out, and this is here because it was asked for: a card that navigates should
 * say so before it is clicked. Kept to a couple of pixels, and dropped entirely for anybody
 * who has asked their system for less motion.
 */
function Wrap({ href, children }: { href: string | null; children: React.ReactNode }) {
  const shell = "flex flex-col gap-2 rounded-card border border-line bg-surface p-4";
  if (!href) return <article className={shell}>{children}</article>;
  return (
    <Link
      href={href}
      className={`${shell} transition-[transform,border-color,box-shadow] duration-150 hover:-translate-y-0.5 hover:border-ink-muted/40 hover:shadow-sm motion-reduce:transform-none motion-reduce:transition-none`}
    >
      {children}
    </Link>
  );
}

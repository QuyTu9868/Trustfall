"use client";

import { use, useEffect, useState } from "react";
import { AdminRecordActions } from "@/components/admin-record-actions";
import { AdminSettle } from "@/components/admin-settle";
import { explorerTxUrl } from "@/lib/chain";
import {
  DEPOSIT_ONLY,
  GATEWAY_LABEL,
  OUTCOME,
  type ChatLine,
  type Filed,
  type Handover,
  type Settled,
  type Verdict,
} from "@/lib/admin-view";

type Detail = {
  verdict: Verdict;
  evidence: Filed[];
  handover: Handover[];
  chat: ChatLine[];
  settled: Settled;
  /** Read off the chain by the route, so a side that filed nothing still has an address. */
  parties: Parties;
};

/**
 * Where the deposit went, and the receipt for it.
 *
 * The line above this one says which of three ways the arbitrator chose. This says what the
 * contract then did, in figures it emitted itself, with a link to the transaction so nobody
 * has to believe either of us. That gap between the claim and the receipt is the only reason
 * this block exists.
 */
function Settlement({ settled, txHash }: { settled: Settled; txHash: string | null }) {
  const url = txHash ? explorerTxUrl(txHash) : undefined;

  return (
    <div className="flex flex-col gap-2 rounded-card border border-line bg-surface p-3">
      {settled ? (
        <>
          <dl className="tabular flex flex-wrap gap-x-8 gap-y-1 text-sm">
            <Row label="To the renter" value={`${settled.toRenter} USDC`} tabular />
            <Row label="To the owner" value={`${settled.toOwner} USDC`} tabular />
            <Row label="Deposit held" value={`${settled.total} USDC`} tabular />
          </dl>
          <p className="text-xs text-ink-muted">{DEPOSIT_ONLY}</p>
        </>
      ) : (
        // The hash is still worth showing on its own. It is the thing somebody checks with.
        <p className="text-xs text-ink-muted">
          The amounts could not be read back from the chain just now.
        </p>
      )}

      {url ? (
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="tabular text-[11px] break-all text-live-ink underline underline-offset-2"
        >
          {txHash}
        </a>
      ) : (
        <p className="tabular text-[11px] break-all text-live-ink">{txHash}</p>
      )}
    </div>
  );
}

/**
 * One dispute, in the order somebody auditing it would want to read it.
 *
 * The working first, then the material it was drawn from. That order is the whole point:
 * findings can only be checked against the sources below them, and a page that put the
 * evidence first would invite reading the ruling as a summary of it rather than as a claim
 * about it.
 *
 * Nothing here can be acted on. Every button that moves a deposit lives behind a wallet
 * key, and this page is a record.
 */
export default function AdminDisputePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const response = await fetch(`/api/admin?rentalId=${id}`);
        if (!active) return;
        if (response.status === 401) {
          setError("Signed out. Unlock the log again from the list.");
          return;
        }
        const result = await response.json();
        if (!response.ok) throw new Error(result.error ?? "That dispute could not be read.");
        setDetail(result as Detail);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "That dispute could not be read.");
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

  const { verdict, evidence, handover, chat, settled, parties } = detail;

  return (
    <main className="flex max-w-4xl flex-col gap-8">
      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-3xl">Rental #{verdict.onchain_rental_id}</h1>
          <span
            className={`rounded-full px-2 py-0.5 text-xs tracking-wide uppercase ${
              verdict.signed ? "bg-live-bg text-live-ink" : "bg-pend-bg text-pend-ink"
            }`}
          >
            {verdict.signed ? "applied" : "held back"}
          </span>
        </div>

        <p className="text-lg">{OUTCOME[verdict.verdict]}</p>
        <p className="text-ink-muted">{verdict.reason}</p>

        <dl className="grid gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
          <Row label="Confidence" value={verdict.confidence.toFixed(2)} tabular />
          <Row label="Model" value={verdict.model} />
          <Row label="Decided" value={new Date(verdict.created_at).toLocaleString()} />
          <Row label="Read" value={verdict.evidence_seen} />
        </dl>

        {/* Three steps, because that is how many there actually are between a model
            forming an opinion and a deposit moving, and none of them is optional. The
            agent proposes a word over HTTP; a Latch policy reads the request before the
            server ever sees it; the server checks the confidence bar again on its own and
            signs or refuses. Nothing here says Latch caught anything on this particular
            rental, only whether the hop happened and what it did. */}
        {verdict.gateway && (
          <ol className="flex flex-col gap-2 rounded-card border border-line bg-surface p-4 text-sm">
            <li className="flex items-baseline justify-between gap-4">
              <span>1. Agent proposes {OUTCOME[verdict.verdict]}, over HTTP</span>
              <span className="tabular text-xs text-ink-muted">
                confidence {verdict.confidence.toFixed(2)}
              </span>
            </li>
            <li className="flex flex-col gap-1">
              <span className="flex items-baseline justify-between gap-4">
                <span>2. Latch policy {verdict.gateway === "blocked" ? "refuses it" : "reads it"}</span>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs tracking-wide uppercase ${
                    verdict.gateway === "blocked"
                      ? "bg-stop-bg text-stop-ink"
                      : verdict.gateway === "passed"
                        ? "bg-okay-bg text-okay-ink"
                        : "bg-pend-bg text-pend-ink"
                  }`}
                >
                  {GATEWAY_LABEL[verdict.gateway]}
                </span>
              </span>
              {verdict.gateway_note && (
                <span className="text-xs text-ink-muted">{verdict.gateway_note}</span>
              )}
            </li>
            <li className="flex items-baseline justify-between gap-4">
              <span>3. Server checks the confidence bar itself, and {verdict.signed ? "signs" : "says no"}</span>
              <span
                className={`rounded-full px-2 py-0.5 text-xs tracking-wide uppercase ${
                  verdict.signed ? "bg-live-bg text-live-ink" : "bg-pend-bg text-pend-ink"
                }`}
              >
                {verdict.signed ? "applied" : "held back"}
              </span>
            </li>
          </ol>
        )}

        {/* The two facts that matter most to somebody auditing this: whether money actually
            moved, and if not, why the server declined to move it. */}
        {verdict.signed ? (
          <>
            <Settlement settled={settled} txHash={verdict.tx_hash} />
            {/* Only where it happened. A ruling the arbitrator reached and the server acted
                on says nothing here, because there is nothing to disclose. */}
            {verdict.settled_by === "admin" && (
              <p className="rounded-card border border-line bg-surface p-3 text-sm">
                <span className="text-pend-ink">Decided by a person, not by the model.</span>{" "}
                The arbitrator reached the ruling above and the server would not act on it,
                so somebody with the admin code chose an outcome and signed it.
                {verdict.settled_note ? ` They said: "${verdict.settled_note}"` : ""}
              </p>
            )}
          </>
        ) : (
          <p className="rounded-card border border-line bg-surface p-3 text-sm text-pend-ink">
            Nothing was signed. {verdict.held_back_reason} The agent is the only address the
            contract accepts, so nothing can go around it. Somebody holding the admin code
            can choose one of the three outcomes below and have the server sign it, and
            failing that, seven days after the dispute was opened anybody at all can finalise
            it and the deposit returns to the renter.
          </p>
        )}
      </header>

      {/* Directly under the header, because for an unsigned ruling this is the only thing
          on the page anybody can act on, and it is time limited. */}
      {!verdict.signed && (
        <AdminSettle
          rentalId={verdict.onchain_rental_id}
          onDone={() => window.location.reload()}
        />
      )}

      <section className="flex flex-col gap-3">
        <h2 className="text-xl">How it got there</h2>
        {verdict.findings.length === 0 ? (
          <p className="text-sm text-ink-muted">
            This ruling was recorded before the arbitrator was asked to show its working, so
            only the sentence above survives of it.
          </p>
        ) : (
          <ol className="flex flex-col gap-2">
            {verdict.findings.map((finding, index) => (
              <li
                key={index}
                className="flex flex-col gap-1 rounded-card border border-line bg-surface p-4"
              >
                {/* The source is the point. A finding attributed to a photograph on a
                    dispute where none was filed is a hallucination this page catches. */}
                <span className="text-xs tracking-wide text-ink-muted uppercase">
                  {finding.from}
                </span>
                <span className="text-sm">{finding.says}</span>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl">The argument, side by side</h2>
        <p className="text-sm text-ink-muted">
          What each of them filed, with the conversation they had during the rental between
          the two. Everything the arbitrator was given, in one place, which is what this page
          is for and what the parties' own screens deliberately do not do.
        </p>

        <div className="grid gap-4 lg:grid-cols-3">
          <Filing
            side="renter"
            address={parties?.renter}
            entry={evidence.find((e) => e.side === "renter")}
          />

          <article className="flex flex-col gap-3 rounded-card border border-line bg-surface p-4">
            <span className="text-xs tracking-wide text-ink-muted uppercase">
              What they said to each other
            </span>
            {chat.length === 0 ? (
              <p className="text-sm text-ink-muted">They did not talk during the rental.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {chat.map((line, index) => (
                  <div key={index} className="flex flex-col gap-1 border-b border-line pb-2 last:border-0">
                    {/* Named by role now, which used to be a guess. The chat table stores an
                        address and the evidence table stores a side, and lining those two up
                        was not something this page would do. The rental itself is read off
                        the chain now, so who is who is a fact rather than an inference, and
                        the address stays beside it for checking. */}
                    <span className="text-[11px] text-ink-muted">
                      {whose(line.sender_address, parties)} ·{" "}
                      {new Date(line.created_at).toLocaleString()}
                    </span>
                    <span className="tabular text-[10px] break-all text-ink-muted">
                      {line.sender_address}
                    </span>
                    <span className="text-sm break-words">{line.body}</span>
                  </div>
                ))}
              </div>
            )}
          </article>

          <Filing
            side="owner"
            address={parties?.owner}
            entry={evidence.find((e) => e.side === "owner")}
          />
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl">The handover photos</h2>
        <p className="text-sm text-ink-muted">
          Taken at check-in and check-out regardless of a dispute, not filed for one. Shown
          here because they are the "before and after" the arbitrator itself was given.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          {(["checkin", "checkout"] as const).map((phase) => {
            const shot = handover.find((entry) => entry.phase === phase);
            return (
              <article
                key={phase}
                className="flex flex-col gap-3 rounded-card border border-line bg-surface p-4"
              >
                <span className="text-xs text-ink-muted">
                  {phase === "checkin" ? "Check-in" : "Check-out"}
                  {shot ? `, ${new Date(shot.created_at).toLocaleString()}` : ""}
                </span>
                {shot ? (
                  <>
                    {shot.note && (
                      <p className="text-sm whitespace-pre-wrap break-words">{shot.note}</p>
                    )}
                    {shot.image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={shot.image_url}
                        alt={`The item at ${phase}`}
                        className="max-h-80 w-full rounded-card object-contain"
                      />
                    ) : (
                      <span className="text-xs text-ink-muted">No photo on file.</span>
                    )}
                  </>
                ) : (
                  <span className="text-xs text-ink-muted">Not taken.</span>
                )}
              </article>
            );
          })}
        </div>
      </section>

      <AdminRecordActions rentalId={verdict.onchain_rental_id} label={`rental #${verdict.onchain_rental_id}`} />
    </main>
  );
}

type Parties = { owner: string; renter: string } | null;

/** Which side sent a line, by address, or nothing rather than a guess. */
function whose(sender: string, parties: Parties) {
  if (!parties) return "Somebody";
  const at = sender.toLowerCase();
  if (at === parties.renter.toLowerCase()) return "The renter";
  if (at === parties.owner.toLowerCase()) return "The owner";
  return "Somebody else";
}

/**
 * One side's filing, headed by who they are.
 *
 * Rendered even when they filed nothing. A blank column is the record saying this person
 * did not answer, which is a thing the ruling may well have turned on, and a section that
 * simply omitted them would read as though only one side was ever asked.
 */
function Filing({
  side,
  address,
  entry,
}: {
  side: "owner" | "renter";
  address?: string;
  entry?: Filed;
}) {
  return (
    <article className="flex flex-col gap-3 rounded-card border border-line bg-surface p-4">
      <div className="flex flex-col gap-0.5">
        <span className="text-xs tracking-wide text-ink-muted uppercase">The {side}</span>
        {/* In full. This is a page for checking things against the chain, and a truncated
            address cannot be checked against anything. */}
        <span className="tabular text-[10px] break-all text-ink-muted">
          {address ?? "address could not be read from the chain"}
        </span>
      </div>

      {entry ? (
        <>
          <span className="text-[11px] text-ink-muted">
            Filed {new Date(entry.created_at).toLocaleString()}
          </span>
          <p className="text-sm whitespace-pre-wrap break-words">{entry.statement}</p>
          {entry.image_url ? (
            /* object-contain, because a handover photo cropped square can hide the very
               damage it was filed to show. */
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={entry.image_url}
              alt={`Filed by the ${side}`}
              className="max-h-80 w-full rounded-card object-contain"
            />
          ) : (
            <span className="text-xs text-ink-muted">No photo filed.</span>
          )}
        </>
      ) : (
        <p className="text-sm text-ink-muted">
          Filed nothing. The arbitrator ruled without this side's account of it.
        </p>
      )}
    </article>
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


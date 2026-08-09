"use client";

import { use, useEffect, useState } from "react";
import { AdminRecordActions } from "@/components/admin-record-actions";
import { explorerTxUrl } from "@/lib/chain";
import {
  DEPOSIT_ONLY,
  OUTCOME,
  type ChatLine,
  type Filed,
  type Settled,
  type Verdict,
} from "@/lib/admin-view";

type Detail = { verdict: Verdict; evidence: Filed[]; chat: ChatLine[]; settled: Settled };

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

  const { verdict, evidence, chat, settled } = detail;

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

        {/* The two facts that matter most to somebody auditing this: whether money actually
            moved, and if not, why the server declined to move it. */}
        {verdict.signed ? (
          <Settlement settled={settled} txHash={verdict.tx_hash} />
        ) : (
          <p className="rounded-card border border-line bg-surface p-3 text-sm text-pend-ink">
            Nothing was signed. {verdict.held_back_reason} Nobody can sign it instead: the
            agent is the only address the contract accepts. Seven days after the dispute was
            opened, anybody at all can finalise it and the deposit returns to the renter.
          </p>
        )}
      </header>

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
        <h2 className="text-xl">What each side filed</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {evidence.map((filed) => (
            <article
              key={filed.side}
              className="flex flex-col gap-3 rounded-card border border-line bg-surface p-4"
            >
              <span className="text-xs text-ink-muted">
                The {filed.side}, {new Date(filed.created_at).toLocaleString()}
              </span>
              <p className="text-sm whitespace-pre-wrap break-words">{filed.statement}</p>
              {filed.image_url ? (
                /* object-contain, because a handover photo cropped square can hide the very
                   damage it was filed to show. */
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={filed.image_url}
                  alt={`Filed by the ${filed.side}`}
                  className="max-h-80 w-full rounded-card object-contain"
                />
              ) : (
                <span className="text-xs text-ink-muted">No photograph filed.</span>
              )}
            </article>
          ))}
          {evidence.length === 0 && (
            <p className="text-sm text-ink-muted">Nothing was filed by either side.</p>
          )}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl">What they said during the rental</h2>
        {chat.length === 0 ? (
          <p className="text-sm text-ink-muted">They did not talk during the rental.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {/* Addressed by wallet rather than by role. The chat table stores an address and
                the evidence table stores a role, and lining the two up to tint the bubbles
                would be a guess dressed up as a fact on the one page that exists to be
                checked. The address is printed instead. */}
            {chat.map((line, index) => (
              <div
                key={index}
                className="flex flex-col gap-1 rounded-card border border-line bg-surface p-3"
              >
                <span className="tabular text-[11px] text-ink-muted">
                  {line.sender_address} · {new Date(line.created_at).toLocaleString()}
                </span>
                <span className="text-sm break-words">{line.body}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      <AdminRecordActions rentalId={verdict.onchain_rental_id} label={`rental #${verdict.onchain_rental_id}`} />
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


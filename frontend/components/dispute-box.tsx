"use client";

import { useIdentityToken } from "@privy-io/react-auth";
import { useEffect, useMemo, useState } from "react";
import { DEPOSIT_ONLY, type Settled } from "@/lib/admin-view";
import { explorerTxUrl } from "@/lib/chain";

type Filed = {
  side: "owner" | "renter";
  statement: string;
  image_url: string | null;
  created_at: string;
};
type Ruling = {
  verdict: "refund_renter" | "split" | "pay_owner";
  confidence: number;
  reason: string;
  signed: boolean;
  tx_hash: string | null;
  held_back_reason: string | null;
};

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/** What each outcome means for the deposit, in the words somebody losing would read. */
const OUTCOME: Record<Ruling["verdict"], string> = {
  refund_renter: "The whole deposit goes back to the renter.",
  split: "The deposit is split down the middle.",
  pay_owner: "The owner keeps the deposit.",
};

/**
 * Filing an account of what went wrong, and reading what came of it.
 *
 * Both statements are shown to both people. The arbitrator sees both regardless, so hiding
 * one from the other would only mislead whoever is reading, and arguing about somebody's
 * deposit behind their back is not a thing worth making easy.
 *
 * There is no button here that runs the arbitrator. It runs when both sides have filed,
 * or when the first has waited a day: whoever expects to lose would never press it.
 */
export function DisputeBox({ rentalId }: { rentalId: bigint }) {
  const { identityToken } = useIdentityToken();

  const [mine, setMine] = useState<"owner" | "renter" | null>(null);
  const [filed, setFiled] = useState<Filed[] | null>(null);
  const [ruling, setRuling] = useState<Ruling | null>(null);
  const [settled, setSettled] = useState<Settled>(null);

  const [appeal, setAppeal] = useState("");
  const [appealNote, setAppealNote] = useState<string | null>(null);
  const [appealOpen, setAppealOpen] = useState(false);
  const [statement, setStatement] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloads, setReloads] = useState(0);

  const preview = useMemo(() => (photo ? URL.createObjectURL(photo) : null), [photo]);
  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  useEffect(() => {
    let active = true;

    const load = async () => {
      try {
        const response = await fetch(`/api/disputes?rentalId=${rentalId}`);
        if (!response.ok) return;
        const result = await response.json();
        if (!active) return;
        setMine(result.mine);
        setFiled(result.evidence as Filed[]);
        setRuling(result.verdict as Ruling | null);
        setSettled((result.settled ?? null) as Settled);
      } catch {
        // A missed poll leaves the last answer on screen, which is better than blanking it.
      }
    };

    void load();
    // Slow: this only changes when somebody files, and one of the two changes is your own.
    const timer = setInterval(load, 10000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [rentalId, reloads]);

  async function file() {
    if (!statement.trim() || sending) return;
    setSending(true);
    setError(null);
    try {
      const body = new FormData();
      body.set("rentalId", rentalId.toString());
      body.set("statement", statement.trim());
      if (photo) body.set("image", photo);

      const response = await fetch("/api/disputes", {
        method: "POST",
        headers: identityToken ? { "privy-id-token": identityToken } : undefined,
        body,
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Could not file that.");
      setStatement("");
      setPhoto(null);
      setReloads((count) => count + 1);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not file that.");
    } finally {
      setSending(false);
    }
  }

  const alreadyFiled = filed?.some((entry) => entry.side === mine);
  const waitingOnThem = filed?.length === 1 && alreadyFiled;
  const bothFiled = (filed?.length ?? 0) >= 2;

  async function retry() {
    setSending(true);
    setError(null);
    try {
      const response = await fetch("/api/disputes", {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          ...(identityToken ? { "privy-id-token": identityToken } : {}),
        },
        body: JSON.stringify({ rentalId: rentalId.toString() }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "That did not work.");
      setReloads((count) => count + 1);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "That did not work.");
    } finally {
      setSending(false);
    }
  }

  async function sendAppeal() {
    if (!appeal.trim() || sending) return;
    setSending(true);
    setError(null);
    try {
      const response = await fetch("/api/disputes/appeal", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(identityToken ? { "privy-id-token": identityToken } : {}),
        },
        body: JSON.stringify({ rentalId: rentalId.toString(), statement: appeal.trim() }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "That did not go through.");
      setAppeal("");
      setAppealOpen(false);
      // Says which of the two things happened. An appeal filed after the deposit has moved
      // cannot change it, and letting somebody believe otherwise is the worse outcome.
      setAppealNote(
        result.rejudged
          ? "Judged again with your appeal in evidence."
          : (result.message ?? "Your appeal is recorded.")
      );
      setReloads((count) => count + 1);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "That did not go through.");
    } finally {
      setSending(false);
    }
  }

  return (
    <section className="flex flex-col gap-4 rounded-card border border-stop-ink/30 bg-stop-bg/40 p-4">
      <div className="flex flex-col gap-1">
        <h3 className="text-sm">Dispute</h3>
        <p className="text-xs text-ink-muted">
          Both accounts go to an arbitrator, which reads the statements and your
          conversation and picks one of three outcomes for the deposit. It never sees an
          amount and never moves the money: the contract does the arithmetic itself.
        </p>
      </div>

      {/* Both sides see both filings, photographs included. Somebody who cannot see what
          was filed against them has no way to judge whether the ruling was reasonable. */}
      {filed?.map((entry) => (
        <div key={entry.side} className="flex flex-col gap-2 rounded-card border border-line bg-surface p-3">
          <span className="text-xs text-ink-muted">
            The {entry.side} said, {new Date(entry.created_at).toLocaleString()}
          </span>
          <p className="text-sm whitespace-pre-wrap break-words">{entry.statement}</p>
          {entry.image_url && (
            /* object-contain, because a handover photo cropped to a square can hide the
               very damage it was filed to show. */
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={entry.image_url}
              alt={`Filed by the ${entry.side}`}
              className="max-h-72 w-full rounded-card object-contain"
            />
          )}
        </div>
      ))}

      {!alreadyFiled && (
        <div className="flex flex-col gap-2">
          <textarea
            value={statement}
            onChange={(event) => setStatement(event.target.value)}
            rows={3}
            maxLength={1500}
            placeholder="What happened, in your words. Describe it: the arbitrator reads text, and the photo is for the other side and the log."
            className="rounded-control border border-line bg-surface px-3 py-2 text-sm"
          />

          {preview && (
            <div className="flex items-center gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={preview} alt="Your evidence" className="h-16 w-16 rounded object-cover" />
              <button onClick={() => setPhoto(null)} className="text-xs text-ink-muted underline">
                Remove
              </button>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <label className="cursor-pointer rounded-control border border-line bg-surface px-3 py-2 text-sm text-ink-muted">
              {photo ? "Change photo" : "Add a photo"}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={(event) => {
                  const chosen = event.target.files?.[0] ?? null;
                  setError(chosen && chosen.size > MAX_IMAGE_BYTES ? "That photo is over 5MB." : null);
                  setPhoto(chosen && chosen.size <= MAX_IMAGE_BYTES ? chosen : null);
                }}
                className="hidden"
              />
            </label>
            <button
              onClick={file}
              disabled={sending || statement.trim().length === 0}
              className="rounded-control bg-ink-strong px-4 py-2 text-sm text-canvas disabled:opacity-40"
            >
              {sending ? "Filing..." : "File this"}
            </button>
            <span className="text-xs text-ink-muted">You get one submission.</span>
          </div>
        </div>
      )}

      {/* The arbitrator can fail for reasons that have nothing to do with the dispute: a
          busy minute, a request over the plan's limit. Without a way to ask again, that
          leaves the deposit stuck until the seven day timeout decides it by default. */}
      {bothFiled && !ruling?.signed && (
        <button
          onClick={retry}
          disabled={sending}
          className="w-fit rounded-control border border-line bg-surface px-4 py-2 text-sm disabled:opacity-40"
        >
          {sending ? "Asking..." : ruling ? "Ask the arbitrator again" : "Ask the arbitrator now"}
        </button>
      )}

      {waitingOnThem && !ruling && (
        <p className="text-xs text-ink-muted">
          Filed. Waiting for the other side. If they say nothing for a day, the arbitrator
          rules on what it has.
        </p>
      )}

      {ruling && (
        <div className="flex flex-col gap-2 rounded-card border border-line bg-surface p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="text-sm">{OUTCOME[ruling.verdict]}</span>
            <span className="tabular text-xs text-ink-muted">
              confidence {ruling.confidence.toFixed(2)}
            </span>
          </div>
          <p className="text-sm text-ink-muted">{ruling.reason}</p>

          {/* Whether it was acted on is a different fact from what it decided, and the
              difference is the whole point of having a threshold. */}
          {ruling.signed ? (
            <div className="flex flex-col gap-1">
              {/* The figures, not only the word. "Deposit split" is a summary; these two
                  numbers are what each of them will see arrive, and the link is how they
                  check it without asking us. */}
              {settled ? (
                <span className="tabular text-xs text-ink-muted">
                  Renter {settled.toRenter} USDC · owner {settled.toOwner} USDC · of{" "}
                  {settled.total} held. {DEPOSIT_ONLY}
                </span>
              ) : null}
              {explorerTxUrl(ruling.tx_hash ?? "") ? (
                <a
                  href={explorerTxUrl(ruling.tx_hash ?? "")}
                  target="_blank"
                  rel="noreferrer"
                  className="tabular text-[11px] text-live-ink underline underline-offset-2 break-all"
                >
                  Applied on chain: {ruling.tx_hash}
                </a>
              ) : (
                <span className="tabular text-[11px] text-live-ink break-all">
                  Applied on chain: {ruling.tx_hash}
                </span>
              )}
            </div>
          ) : (
            <span className="text-xs text-pend-ink">
              Not applied. {ruling.held_back_reason} There is no one to overrule it: the
              agent is the only address the contract lets settle a dispute. Seven days after
              this was opened, anyone can finalise it and the deposit comes back to the
              renter.
            </span>
          )}
        </div>
      )}

      {/* Only once there is something to appeal against, and only for the two of them.
          The arbitrator runs at temperature zero, so asking it the same question again
          returns the same answer: an appeal has to carry an argument it did not have. */}
      {ruling && mine && (
        <div className="flex flex-col gap-2 border-t border-line pt-4">
          {appealNote ? (
            <p className="text-xs text-pend-ink">{appealNote}</p>
          ) : appealOpen ? (
            <>
              <textarea
                value={appeal}
                onChange={(event) => setAppeal(event.target.value)}
                rows={3}
                maxLength={1500}
                placeholder="What did the arbitrator miss? Repeating your statement will not change the answer."
                className="rounded-control border border-line bg-surface px-3 py-2 text-sm"
              />
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={sendAppeal}
                  disabled={sending || appeal.trim().length === 0}
                  className="rounded-control bg-ink-strong px-4 py-2 text-sm text-canvas disabled:opacity-40"
                >
                  {sending ? "Sending..." : "Send the appeal"}
                </button>
                <button
                  onClick={() => setAppealOpen(false)}
                  className="text-xs text-ink-muted underline"
                >
                  Cancel
                </button>
                <span className="text-xs text-ink-muted">
                  {ruling.signed
                    ? "The deposit has already moved and the contract cannot take it back, so this is recorded rather than acted on."
                    : "The deposit has not moved, so this is judged again."}
                </span>
              </div>
            </>
          ) : (
            <button
              onClick={() => setAppealOpen(true)}
              className="w-fit rounded-control border border-line bg-surface px-4 py-2 text-sm"
            >
              Appeal this
            </button>
          )}
        </div>
      )}

      {error && <p className="text-xs text-stop-ink">{error}</p>}
    </section>
  );
}

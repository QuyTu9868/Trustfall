"use client";

import { useIdentityToken } from "@privy-io/react-auth";
import { useEffect, useMemo, useState } from "react";

type Photo = {
  phase: "checkin" | "checkout";
  note: string | null;
  created_at: string;
  image_url: string | null;
};

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

const WORDING = {
  checkin: {
    title: "Photograph it now you have it",
    why: "Taken before anything has gone wrong, this is what a dispute gets compared against later. Without it, an argument about a scratch is one person's word against another's.",
  },
  checkout: {
    title: "Photograph it now it is back",
    why: "The other half of the pair. Damage visible here and not at check-in happened during the rental, and that is a question the arbitrator can answer from two pictures rather than from two stories. If something is wrong, open a dispute rather than writing it here.",
  },
} as const;

/**
 * The photograph taken at a handover, by whoever is receiving the item.
 *
 * A panel rather than a step inside the scanning flow, because it has to survive a refresh.
 * Attached to the moment of scanning, a missed upload is missed for good, and the picture
 * this asks for is the only evidence in the whole system that predates the argument.
 *
 * One per handover and no replacing it. Being able to swap the picture after finding out
 * what the argument is about would undo the point of taking it early.
 */
export function HandoverPhoto({
  rentalId,
  phase,
  canUpload,
}: {
  rentalId: bigint;
  phase: "checkin" | "checkout";
  /** Whoever received the item at this handover: the renter at check-in, the owner after. */
  canUpload: boolean;
}) {
  const { identityToken } = useIdentityToken();
  const [photos, setPhotos] = useState<Photo[] | null>(null);
  const [note, setNote] = useState("");
  const [chosen, setChosen] = useState<File | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloads, setReloads] = useState(0);

  const preview = useMemo(() => (chosen ? URL.createObjectURL(chosen) : null), [chosen]);
  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const response = await fetch(`/api/handover-photo?rentalId=${rentalId}`, {
          headers: identityToken ? { "privy-id-token": identityToken } : undefined,
        });
        if (!response.ok || !active) return;
        const result = await response.json();
        setPhotos(result.photos as Photo[]);
      } catch {
        // Leaves the last answer on screen rather than blanking it.
      }
    })();
    return () => {
      active = false;
    };
  }, [rentalId, identityToken, reloads]);

  function choose(file: File | null) {
    if (file && file.size > MAX_IMAGE_BYTES) {
      setError("That photo is over 5MB.");
      return;
    }
    setError(null);
    setChosen(file);
  }

  async function upload() {
    if (!chosen || sending) return;
    setSending(true);
    setError(null);
    try {
      const body = new FormData();
      body.set("rentalId", rentalId.toString());
      body.set("phase", phase);
      body.set("image", chosen);
      // Sent even when empty, so the server decides what an empty note means rather than
      // the browser deciding whether to mention it at all.
      body.set("note", note.trim());
      const response = await fetch("/api/handover-photo", {
        method: "POST",
        headers: identityToken ? { "privy-id-token": identityToken } : undefined,
        body,
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "That did not upload.");
      setChosen(null);
      setNote("");
      setReloads((count) => count + 1);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "That did not upload.");
    } finally {
      setSending(false);
    }
  }

  const taken = photos?.find((photo) => photo.phase === phase);

  // Both sides see both photographs. The arbitrator weighs them either way, and somebody
  // who cannot see what will be used against them cannot tell whether it is fair.
  if (taken) {
    return (
      <section className="flex flex-col gap-2 rounded-card border border-line bg-surface p-4">
        <span className="text-xs text-ink-muted">
          Photographed at {phase === "checkin" ? "check-in" : "check-out"},{" "}
          {new Date(taken.created_at).toLocaleString()}
        </span>
        {taken.note && <p className="text-sm whitespace-pre-wrap break-words">{taken.note}</p>}
        {taken.image_url && (
          /* object-contain, because a handover photo cropped square can hide the very
             damage it was taken to record. */
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={taken.image_url}
            alt={`The item at ${phase}`}
            className="max-h-72 w-full rounded-card object-contain"
          />
        )}
      </section>
    );
  }

  if (!canUpload) return null;

  return (
    <section className="flex flex-col gap-3 rounded-card border border-okay-ink/30 bg-okay-bg/40 p-4">
      <div className="flex flex-col gap-1">
        <h3 className="text-sm">{WORDING[phase].title}</h3>
        <p className="text-xs text-ink-muted">{WORDING[phase].why}</p>
      </div>

      {/* Only at check-in, and the asymmetry is the point.

          The renter is about to use something and needs to say "this was already like
          this": a scuff they can live with, noted now so that nobody calls it theirs at the
          end. That claim has to survive the whole rental, which is why it is written down
          rather than said.

          The owner at check-out has no such need. Whatever they find is either not worth
          mentioning or worth a dispute, and there is a button for the second one. A note
          box there only invited them to complain into a field that decides nothing.

          Written before sending rather than after, because the picture and the sentence
          about it are one act. Uploading first and asking afterwards produces a photograph
          with no note, every time. */}
      {phase === "checkin" && (
        <textarea
          value={note}
          onChange={(event) => setNote(event.target.value)}
          rows={2}
          maxLength={500}
          placeholder="Anything already wrong with it? A scratch you can live with, noted now, is a scratch nobody can blame on you later."
          className="rounded-control border border-line bg-surface px-3 py-2 text-sm"
        />
      )}

      {preview && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={preview} alt="What you are about to send" className="max-h-72 w-full rounded-card object-contain" />
      )}

      <div className="flex flex-wrap items-center gap-3">
        <label className="cursor-pointer rounded-control border border-line bg-surface px-4 py-2 text-sm">
          {chosen ? "Change photo" : "Choose a photo"}
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            capture="environment"
            disabled={sending}
            onChange={(event) => choose(event.target.files?.[0] ?? null)}
            className="hidden"
          />
        </label>

        <button
          onClick={upload}
          disabled={sending || !chosen}
          className="rounded-control bg-ink-strong px-4 py-2 text-sm text-canvas disabled:opacity-40"
        >
          {sending ? "Sending..." : "Send it"}
        </button>

        <span className="text-xs text-ink-muted">
          {chosen ? chosen.name : "One photo, and it cannot be replaced."}
        </span>
      </div>

      {error && <p className="text-xs text-stop-ink">{error}</p>}
    </section>
  );
}

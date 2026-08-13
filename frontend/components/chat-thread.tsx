"use client";

import { useIdentityToken } from "@privy-io/react-auth";
import { useEffect, useMemo, useRef, useState } from "react";
import { useAccount } from "wagmi";

type Message = {
  id: number;
  sender_address: string;
  body: string | null;
  image_url: string | null;
  created_at: string;
};

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/** How often the thread asks for new messages while it is on screen. */
const POLL_MS = 15000;

/**
 * The conversation for one rental.
 *
 * Used in two places, which is why it is a component and not a page: inline on a rental
 * card, and again in the inbox at /messages. Both need exactly this, and having one of
 * them be a slightly different copy is how the two drift apart.
 *
 * New messages arrive by asking again every few seconds rather than over a socket.
 * Supabase Realtime would need the chat table opened up to the anon key, and a private
 * conversation is the last table to do that to for a feature nobody will notice.
 */
export function ChatThread({ rentalId }: { rentalId: bigint }) {
  const { identityToken } = useIdentityToken();
  const { address } = useAccount();

  const [messages, setMessages] = useState<Message[] | null>(null);
  const [draft, setDraft] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloads, setReloads] = useState(0);

  const endRef = useRef<HTMLDivElement>(null);
  // Derived rather than set in an effect, and the effect only cleans up. Creating the
  // URL inside an effect means one render where a photo is chosen and nothing is shown.
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
        const response = await fetch(`/api/messages?rentalId=${rentalId}`);
        const result = await response.json();
        if (!active) return;
        if (!response.ok) {
          setError(result.error ?? "Could not load the conversation.");
          return;
        }
        setError(null);
        setMessages(result.messages as Message[]);
      } catch {
        // A dropped poll is not worth an error on screen. The next one is 5 seconds away.
      }
    };

    void load();
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
    const timer = setInterval(tick, POLL_MS);
    document.addEventListener("visibilitychange", tick);
    return () => {
      active = false;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [rentalId, reloads]);

  // Follow the conversation down as it grows, the way every chat does.
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "nearest" });
  }, [messages]);

  const me = address?.toLowerCase();

  function pickPhoto(file: File | null) {
    setError(null);
    if (file && file.size > MAX_IMAGE_BYTES) {
      setError("That photo is over 5MB.");
      return;
    }
    setPhoto(file);
  }

  async function send() {
    const text = draft.trim();
    if ((!text && !photo) || sending) return;

    setSending(true);
    setError(null);
    try {
      // Multipart, not JSON, so the photo travels with the message rather than needing a
      // second request that could succeed while the first one failed.
      const body = new FormData();
      body.set("rentalId", rentalId.toString());
      body.set("body", text);
      if (photo) body.set("image", photo);

      const response = await fetch("/api/messages", {
        method: "POST",
        headers: identityToken ? { "privy-id-token": identityToken } : undefined,
        body,
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Could not send that.");
      setDraft("");
      setPhoto(null);
      setReloads((count) => count + 1);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not send that.");
    } finally {
      setSending(false);
    }
  }

  return (
    <section className="flex flex-col gap-3">
      <div className="flex max-h-64 flex-col gap-2 overflow-y-auto rounded-card border border-line bg-canvas p-3">
        {messages === null && <p className="text-xs text-ink-muted">Loading...</p>}

        {messages?.length === 0 && (
          <p className="text-xs text-ink-muted">
            No messages yet. Agree a time and place to hand the item over.
          </p>
        )}

        {messages?.map((message) => {
          const mine = message.sender_address === me;
          return (
            <div key={message.id} className={mine ? "self-end text-right" : "self-start"}>
              <div
                className={`inline-block max-w-[36ch] overflow-hidden rounded-card text-sm ${
                  mine ? "bg-ink-strong text-canvas" : "border border-line bg-surface"
                }`}
              >
                {message.image_url && (
                  /* Plain img rather than next/image: the link is signed and expires, so
                     there is nothing for the optimiser to cache usefully. object-contain
                     because a handover photo cropped to a square can hide the damage it
                     was sent to show. */
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={message.image_url}
                    alt="Sent photo"
                    className="max-h-64 w-full object-contain"
                  />
                )}
                {message.body && (
                  /* Plain text, deliberately. Whatever the other person typed is data. */
                  <span className="block whitespace-pre-wrap break-words px-3 py-1.5">
                    {message.body}
                  </span>
                )}
              </div>
              <div className="mt-0.5 text-[11px] text-ink-muted">
                {new Date(message.created_at).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </div>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>

      {preview && (
        <div className="flex items-center gap-3 rounded-card border border-line bg-canvas p-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={preview} alt="About to send" className="h-16 w-16 rounded object-cover" />
          <button onClick={() => setPhoto(null)} className="text-xs text-ink-muted underline">
            Remove
          </button>
        </div>
      )}

      <div className="flex gap-2">
        <label className="flex cursor-pointer items-center rounded-control border border-line px-3 text-sm text-ink-muted">
          Photo
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={(event) => pickPhoto(event.target.files?.[0] ?? null)}
            className="hidden"
          />
        </label>
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void send();
            }
          }}
          maxLength={2000}
          placeholder="Write a message"
          className="flex-1 rounded-control border border-line bg-surface px-3 py-2 text-sm"
        />
        <button
          onClick={send}
          disabled={sending || (draft.trim().length === 0 && !photo)}
          className="rounded-control bg-ink-strong px-4 py-2 text-sm text-canvas disabled:opacity-40"
        >
          {sending ? "Sending..." : "Send"}
        </button>
      </div>

      {error && <p className="text-xs text-stop-ink">{error}</p>}
    </section>
  );
}

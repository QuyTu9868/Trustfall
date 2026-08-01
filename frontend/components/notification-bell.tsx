"use client";

import { usePrivy } from "@privy-io/react-auth";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useAccount } from "wagmi";

type Notification = {
  id: number;
  kind: string;
  body: string;
  is_read: boolean;
  created_at: string;
  onchain_rental_id: number | null;
};

const POLL_MS = 15000;

/**
 * The bell in the header, with a dot when something is waiting.
 *
 * Polls slowly. Nothing here is urgent enough to justify a socket, and the header sits on
 * every page, so whatever it does it does everywhere at once.
 */
export function NotificationBell() {
  const { authenticated } = usePrivy();
  const { address } = useAccount();
  // The list is kept with the wallet it belongs to. Sign out of one account and into
  // another and the old notifications would otherwise sit on screen, addressed to
  // somebody else, until the first poll of the new session came back.
  const [loaded, setLoaded] = useState<{ owner?: string; list: Notification[] }>({ list: [] });
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!authenticated || !address) return;
    let active = true;

    const load = async () => {
      try {
        const response = await fetch("/api/notifications");
        if (!response.ok) return;
        const result = await response.json();
        if (active) setLoaded({ owner: address, list: result.notifications as Notification[] });
      } catch {
        // Silent. A header that shouts about a failed poll is worse than a stale bell.
      }
    };

    void load();
    const timer = setInterval(load, POLL_MS);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [authenticated, address, open]);

  if (!authenticated) return null;

  const items = loaded.owner === address ? loaded.list : [];
  const unread = items.filter((item) => !item.is_read).length;

  async function toggle() {
    const nowOpen = !open;
    setOpen(nowOpen);
    // Opening the list is what counts as having seen it. Marking read on close would
    // leave the dot up while the user is looking straight at the thing it refers to.
    if (nowOpen && unread > 0) {
      setLoaded((current) => ({
        ...current,
        list: current.list.map((item) => ({ ...item, is_read: true })),
      }));
      await fetch("/api/notifications", { method: "PATCH" });
    }
  }

  return (
    <div className="relative">
      <button
        onClick={toggle}
        aria-label={unread > 0 ? `${unread} unread notifications` : "Notifications"}
        className="relative flex h-8 w-8 items-center justify-center rounded-control border border-line text-sm"
      >
        <BellIcon />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-stop-ink" />
        )}
      </button>

      {open && (
        <>
          {/* Clicking anywhere else closes it, which is what people expect and what a
              dropdown without one is quietly annoying for. */}
          <button
            aria-hidden
            tabIndex={-1}
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-10 cursor-default"
          />
          <div className="absolute right-0 z-20 mt-2 flex w-80 flex-col divide-y divide-line rounded-card border border-line bg-surface shadow-sm">
            {items.length === 0 && (
              <p className="p-4 text-xs text-ink-muted">Nothing yet.</p>
            )}
            {items.map((item) => (
              <Link
                key={item.id}
                href="/rentals"
                onClick={() => setOpen(false)}
                className="flex flex-col gap-1 p-3 text-sm"
              >
                <span>{item.body}</span>
                <span className="text-[11px] text-ink-muted">
                  {new Date(item.created_at).toLocaleString()}
                </span>
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function BellIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M13.7 21a2 2 0 0 1-3.4 0" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

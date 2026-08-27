"use client";

import { usePrivy } from "@privy-io/react-auth";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useAccount } from "wagmi";
import { badgeCount } from "@/lib/badge-count";
import { useUnread } from "@/lib/use-unread";

type Notification = {
  id: number;
  kind: string;
  body: string;
  is_read: boolean;
  created_at: string;
  onchain_rental_id: number | null;
  listing_id: string | null;
};

const POLL_MS = 15000;

function dismissedNotificationsKey(address: string) {
  return `trustfall:dismissed-notifications:${address.toLowerCase()}`;
}

/**
 * The bell, split into what happened and who is waiting for a reply.
 *
 * Two lists rather than one, because they are answered differently. A rental moving on is
 * news you read; an unread message is somebody waiting. Mixed together, the messages get
 * buried under six lines about deposits and nobody replies.
 *
 * The message half is not built from notification rows. Messages stopped writing those
 * when the unread badges arrived, and rebuilding them now would mean two mechanisms
 * counting the same thing and eventually disagreeing. The counts are the source.
 */
export function NotificationBell() {
  const { authenticated } = usePrivy();
  const { address } = useAccount();
  const unread = useUnread();

  // The list is kept with the wallet it belongs to. Sign out of one account and into
  // another and the old notifications would otherwise sit on screen, addressed to
  // somebody else, until the first poll of the new session came back.
  const [loaded, setLoaded] = useState<{ owner?: string; list: Notification[] }>({ list: [] });
  const [open, setOpen] = useState(false);
  const [section, setSection] = useState<"rentals" | "messages" | null>(null);
  // A wallet used heavily for testing ends up with a bell full of old news nobody needs
  // again. Dismissing is local and permanent: the row still exists in the database (an
  // owner or an admin reading the same rental still sees the same history), it just stops
  // showing up here.
  const [dismissed, setDismissed] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (!address) return;
    try {
      const raw = localStorage.getItem(dismissedNotificationsKey(address));
      if (raw) setDismissed(new Set(JSON.parse(raw)));
    } catch {
      // Worst case old notifications reappear once.
    }
  }, [address]);

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
  }, [authenticated, address, open]);

  if (!authenticated) return null;

  const items = (loaded.owner === address ? loaded.list : []).filter(
    (item) => !dismissed.has(item.id),
  );
  const unreadNotices = items.filter((item) => !item.is_read).length;
  const threads = Object.entries(unread.counts).filter(([, count]) => count > 0);
  const total = unreadNotices + unread.total;

  function clearAll() {
    if (!address || items.length === 0) return;
    const next = new Set(dismissed);
    for (const item of items) next.add(item.id);
    setDismissed(next);
    try {
      localStorage.setItem(dismissedNotificationsKey(address), JSON.stringify([...next]));
    } catch {
      // Local-only convenience; a failed write just means it reappears next visit.
    }
  }

  async function toggle() {
    const nowOpen = !open;
    setOpen(nowOpen);
    setSection(null);
    // Opening the list is what counts as having seen the news. Messages are not marked
    // here: those clear when the conversation is actually opened, because a glance at a
    // count is not the same as having read what somebody wrote.
    if (nowOpen && unreadNotices > 0) {
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
        aria-label={total > 0 ? `${total} unread` : "Notifications"}
        className="relative flex h-8 w-8 items-center justify-center rounded-control border border-line text-sm"
      >
        <BellIcon />
        {total > 0 && (
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
          <div className="absolute right-0 z-20 mt-2 flex max-h-[70vh] w-80 flex-col divide-y divide-line overflow-y-auto rounded-card border border-line bg-surface shadow-sm">
            <Section
              title="Rentals and listings"
              count={items.length}
              badge={unreadNotices}
              open={section === "rentals"}
              onToggle={() => setSection(section === "rentals" ? null : "rentals")}
            >
              {items.length === 0 ? (
                <p className="px-3 pb-3 text-xs text-ink-muted">Nothing yet.</p>
              ) : (
                <>
                  {items.map((item) => (
                    <Link
                      key={item.id}
                      // News about a listing belongs on the listings page, not the rentals
                      // one. A notification that opens somewhere unrelated is a notification
                      // people stop opening.
                      href={
                        item.listing_id
                          ? "/profile"
                          : item.onchain_rental_id
                            ? `/rentals/${item.onchain_rental_id}`
                            : "/profile"
                      }
                      onClick={() => setOpen(false)}
                      className="flex flex-col gap-1 border-t border-line p-3 text-sm"
                    >
                      <span>{item.body}</span>
                      <span className="text-[11px] text-ink-muted">
                        {new Date(item.created_at).toLocaleString()}
                      </span>
                    </Link>
                  ))}
                  <button
                    onClick={clearAll}
                    className="border-t border-line p-3 text-left text-xs text-ink-muted underline decoration-line underline-offset-4"
                  >
                    Clear all
                  </button>
                </>
              )}
            </Section>

            <Section
              title="Messages"
              count={threads.length}
              badge={unread.total}
              open={section === "messages"}
              onToggle={() => setSection(section === "messages" ? null : "messages")}
            >
              {threads.length === 0 ? (
                <p className="px-3 pb-3 text-xs text-ink-muted">Nobody is waiting.</p>
              ) : (
                threads.map(([rentalId, count]) => (
                  <Link
                    key={rentalId}
                    // Straight to the conversation. Sending somebody to a page listing
                    // every rental, from a row that already named one, was a click that
                    // looked like nothing had happened when they were already there.
                    href={`/rentals/${rentalId}`}
                    onClick={() => setOpen(false)}
                    className="flex items-center justify-between gap-2 border-t border-line p-3 text-sm"
                  >
                    <span className="tabular">Rental #{rentalId}</span>
                    <span className="text-xs text-ink-muted">
                      {badgeCount(count)} waiting
                    </span>
                  </Link>
                ))
              )}
            </Section>
          </div>
        </>
      )}
    </div>
  );
}

/** A heading that opens and closes. Pressing it again closes it, as asked. */
function Section({
  title,
  count,
  badge,
  open,
  onToggle,
  children,
}: {
  title: string;
  count: number;
  badge: number;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col">
      <button
        onClick={onToggle}
        className="flex items-center justify-between gap-2 p-3 text-left text-sm"
      >
        <span className="flex items-center gap-2">
          {title}
          {badge > 0 && (
            <span className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-stop-ink px-1 text-[11px] leading-none text-canvas tabular">
              {badgeCount(badge)}
            </span>
          )}
        </span>
        <span className="text-xs text-ink-muted">
          {count} {open ? "hide" : "show"}
        </span>
      </button>
      {open && <div className="flex flex-col">{children}</div>}
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

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useUnread } from "@/lib/use-unread";
import { AccountButton } from "./account-button";
import { NotificationBell } from "./notification-bell";
import { ThemeToggle } from "./theme-toggle";
import { UnreadBadge } from "./unread-badge";

const nav = [
  { href: "/", label: "Browse" },
  { href: "/list", label: "List an item" },
  { href: "/profile", label: "Profile" },
];

export function SiteHeader() {
  const pathname = usePathname();
  const unread = useUnread();

  // Nothing behind these links is reachable signed out, and a row of dead ends is a worse
  // first impression than no row at all. The wordmark and the sign in button stay.
  const landing = pathname === "/homepage";

  return (
    <header className="sticky top-0 z-10 border-b border-line bg-canvas/90 backdrop-blur">
      <div className="mx-auto flex h-14 w-full max-w-[90rem] items-center gap-8 px-6">
        <Link href={landing ? "/homepage" : "/"} className="font-display text-xl text-ink-strong">
          Trustfall
        </Link>

        <nav className="flex items-center gap-6 text-sm">
          {(landing ? [] : nav).map((item) => {
            const active =
              item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-1.5 ${
                  active ? "text-ink-strong" : "text-ink-muted"
                }`}
              >
                {item.label}
                {item.href === "/profile" && <UnreadBadge count={unread.total} />}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-3">
          <ThemeToggle />
          {!landing && <NotificationBell />}
          <AccountButton />
        </div>
      </div>
    </header>
  );
}

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useUnread } from "@/lib/use-unread";
import { AccountButton } from "./account-button";
import { NotificationBell } from "./notification-bell";
import { UnreadBadge } from "./unread-badge";

const nav = [
  { href: "/", label: "Browse" },
  { href: "/list", label: "List an item" },
  { href: "/listings/mine", label: "Your listings" },
  { href: "/rentals", label: "Rentals" },
  { href: "/profile", label: "Profile" },
];

export function SiteHeader() {
  const pathname = usePathname();
  const unread = useUnread();

  return (
    <header className="sticky top-0 z-10 border-b border-line bg-canvas/90 backdrop-blur">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-8 px-6">
        <Link href="/" className="font-display text-xl text-ink-strong">
          Trustfall
        </Link>

        <nav className="flex items-center gap-6 text-sm">
          {nav.map((item) => {
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
          <NotificationBell />
          <AccountButton />
        </div>
      </div>
    </header>
  );
}

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AccountButton } from "./account-button";

const nav = [
  { href: "/", label: "Browse" },
  { href: "/list", label: "List an item" },
  { href: "/rentals", label: "Rentals" },
];

export function SiteHeader() {
  const pathname = usePathname();

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
                className={active ? "text-ink-strong" : "text-ink-muted"}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto">
          <AccountButton />
        </div>
      </div>
    </header>
  );
}

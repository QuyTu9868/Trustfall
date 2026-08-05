"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ThemeToggle } from "./theme-toggle";

/**
 * Decides whether a page gets the app around it, or nothing at all.
 *
 * /admin is deliberately not part of the app. It is a log about the app, read by somebody
 * checking what an automated system did with other people's money, and every link out of it
 * is a way to end up somewhere that acts on their behalf. So it gets an empty bar with the
 * theme switch and nothing else: no navigation, no wallet, no notifications, no footer.
 *
 * The check is a prefix, so /admin/[id] and /admin/listings/[id] are covered too. Getting
 * that wrong would put the whole app chrome back on the two pages most worth keeping bare.
 */
export function isAdminRoute(pathname: string) {
  return pathname === "/admin" || pathname.startsWith("/admin/");
}

/**
 * The bar /admin gets instead of the site header.
 *
 * Two things only: the way back to the log, and the theme switch. The way back lives here
 * rather than on each page because the pages below this are dead ends by design - they link
 * to nothing, which is the point - and a dead end with no way out is a page somebody leaves
 * with the browser button, losing the log they had unlocked.
 */
export function AdminBar({ pathname }: { pathname: string }) {
  const deeper = pathname !== "/admin";
  return (
    <header className="border-b border-line bg-canvas">
      <div className="mx-auto flex h-14 w-full max-w-[90rem] items-center px-6">
        {deeper && (
          <Link
            href="/admin"
            className="flex items-center gap-2 text-sm text-ink-muted transition-colors hover:text-ink-strong"
          >
            <svg
              viewBox="0 0 16 16"
              className="size-3.5 stroke-current"
              fill="none"
              strokeWidth={1.8}
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="M10 3L5 8l5 5" />
            </svg>
            The agent log
          </Link>
        )}
        <div className="ml-auto">
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}

/** Renders the app's own header and footer everywhere except /admin. */
export function Chrome({
  header,
  footer,
  children,
}: {
  header: React.ReactNode;
  footer: React.ReactNode;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const admin = isAdminRoute(pathname);
  return (
    <>
      {admin ? <AdminBar pathname={pathname} /> : header}
      {children}
      {admin ? null : footer}
    </>
  );
}

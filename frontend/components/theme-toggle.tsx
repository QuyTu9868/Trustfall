"use client";

import { useSyncExternalStore } from "react";

export type Theme = "light" | "dark";
const THEME_KEY = "trustfall-theme";

/**
 * The current theme lives on the <html> element, not in React state.
 *
 * That is not a workaround, it is where it has to live: a script in the document head sets
 * it before the first paint, long before React starts, because anything later would show
 * the light theme for a frame on the way into a dark page.
 *
 * So this reads the DOM as an external store rather than copying it into state. The server
 * snapshot is null on purpose. The server cannot know which theme this person picked, and
 * a component that guessed would render markup the browser then had to throw away.
 */
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function readTheme(): Theme {
  return document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
}

export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribe, readTheme, () => null);

  function choose(next: Theme) {
    document.documentElement.setAttribute("data-theme", next);
    // Only stored once somebody has actually chosen. Until then the head script stays free
    // to follow the operating system, including when that changes.
    localStorage.setItem(THEME_KEY, next);
    for (const listener of listeners) listener();
  }

  // Same empty box on the server and on the first client pass, so nothing shifts sideways
  // when the real answer arrives a tick later.
  if (theme === null) return <span className="size-9" aria-hidden />;

  const next: Theme = theme === "dark" ? "light" : "dark";

  return (
    <button
      onClick={() => choose(next)}
      title={`Switch to ${next} mode`}
      aria-label={`Switch to ${next} mode`}
      className="flex size-9 items-center justify-center rounded-control border border-line bg-surface text-ink-muted"
    >
      <svg
        viewBox="0 0 24 24"
        className="size-4 stroke-current"
        fill="none"
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        {theme === "dark" ? (
          // A sun while dark means "this button gives you light", which is the question
          // somebody reaching for it is actually asking.
          <>
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
          </>
        ) : (
          <path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" />
        )}
      </svg>
    </button>
  );
}

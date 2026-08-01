/**
 * The unread number as it goes on a badge.
 *
 * Stops at 10+ because past that the exact figure stops meaning anything and a three
 * digit badge starts pushing the layout around. Null for zero, so a badge with nothing
 * to say is not drawn at all: one that is always there stops being a signal.
 *
 * Kept apart from the hook that fetches the counts so it can be tested on its own. The
 * hook pulls in the whole Privy SDK, which a pure string function has no business needing.
 */
export function badgeCount(count: number) {
  if (count <= 0) return null;
  return count > 10 ? "10+" : String(count);
}

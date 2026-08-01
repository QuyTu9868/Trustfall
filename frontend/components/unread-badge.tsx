import { badgeCount } from "@/lib/badge-count";

/**
 * The little number, or nothing at all when there is nothing waiting.
 *
 * Returning null for zero rather than an empty circle is the whole point: a badge that is
 * always there stops being a signal.
 */
export function UnreadBadge({ count }: { count: number }) {
  const label = badgeCount(count);
  if (!label) return null;

  return (
    <span
      aria-label={`${count} unread`}
      className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-stop-ink px-1 text-[11px] leading-none text-white tabular"
    >
      {label}
    </span>
  );
}

"use client";

import { useSecondsLeft } from "@/lib/use-seconds-left";

/**
 * How long until the deposit can be released.
 *
 * UI-REFERENCE.md section 3 asks for this in large type directly under the status strip,
 * not tucked away. It is the one number a renter actually wants after handing something
 * back, and hiding it is how a marketplace feels like it is holding onto your money.
 */
export function DepositCountdown({ releaseAt }: { releaseAt: bigint }) {
  const left = useSecondsLeft(releaseAt);

  if (left <= 0) {
    return (
      <p className="text-sm text-live-ink">
        The waiting period is over. The deposit can be released now.
      </p>
    );
  }

  const days = Math.floor(left / 86400);
  const hours = Math.floor((left % 86400) / 3600);
  const minutes = Math.floor((left % 3600) / 60);
  const seconds = left % 60;

  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-ink-muted">Deposit returns in</span>
      <span className="tabular text-2xl">
        {days > 0 && `${days}d `}
        {String(hours).padStart(2, "0")}:{String(minutes).padStart(2, "0")}:
        {String(seconds).padStart(2, "0")}
      </span>
    </div>
  );
}

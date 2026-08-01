/**
 * Which side of a rental you are on.
 *
 * Every other label on the card is the same for both people: the dates, the money, the
 * status. Which side you are on is the one thing that changes what the buttons do, and it
 * was buried in grey text next to the rental number where nobody read it.
 *
 * Told apart by fill rather than by hue. The palette already spends its colours on
 * status, and a fourth coloured pill next to three others is one more thing to decode.
 * Filled versus outlined reads at a glance and survives being looked at in a hurry.
 */
export function RoleTag({ owner }: { owner: boolean }) {
  return (
    <span
      className={`w-fit rounded-full px-2.5 py-1 text-xs tracking-wide uppercase ${
        owner
          ? "bg-ink-strong text-white"
          : "border border-ink-strong text-ink-strong"
      }`}
    >
      {owner ? "You are lending" : "You are renting"}
    </span>
  );
}

"use client";

export type Moderation =
  | { state: "idle" }
  | { state: "checking" }
  | { state: "approve" }
  | { state: "bypassed" }
  | { state: "reject"; reasons: string[] }
  | { state: "unavailable"; message: string };

/**
 * What the moderator said, and what to do about it.
 *
 * CLAUDE.md section 9 is blunt about this one: a rejection that only says "rejected" loses
 * the owner. So the reasons are the body of the message, not a footnote, and the wording
 * around them assumes the listing is fixable rather than that the person is a problem.
 *
 * A failed check reads differently from a rejection on purpose. One means change your
 * words, the other means wait. Showing them the same way sends people to edit a listing
 * that was never the problem.
 */
export function ModerationResult({ result }: { result: Moderation }) {
  if (result.state === "idle") return null;

  if (result.state === "checking") {
    return <p className="text-sm text-ink-muted">Checking the listing...</p>;
  }

  if (result.state === "approve") {
    return (
      <p className="rounded-card border border-line bg-live-bg px-4 py-3 text-sm text-live-ink">
        Checked and clear. You can publish this.
      </p>
    );
  }

  // Loud on purpose, and a different colour from a pass. Somebody demoing with the check
  // switched off should find that out here rather than afterwards.
  if (result.state === "bypassed") {
    return (
      <p className="rounded-card border border-line bg-pend-bg px-4 py-3 text-sm text-pend-ink">
        The listing check is switched off on this local chain. Nothing was checked. Unset
        MODERATION_BYPASS to turn it back on.
      </p>
    );
  }

  if (result.state === "unavailable") {
    return (
      <div className="flex flex-col gap-1 rounded-card border border-line bg-pend-bg px-4 py-3 text-sm text-pend-ink">
        <span>The checker is not answering, so this cannot be published yet.</span>
        <span className="text-xs">{result.message}</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-card border border-line bg-stop-bg px-4 py-3 text-sm text-stop-ink">
      <span>This listing was not accepted. Here is what to change:</span>
      <ul className="flex list-disc flex-col gap-1 pl-5">
        {result.reasons.map((reason) => (
          <li key={reason}>{reason}</li>
        ))}
      </ul>
      <span className="text-xs">Edit it and check again. There is no limit on tries.</span>
    </div>
  );
}

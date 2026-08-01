import { STATUS_STRIP, STATUS_TONE, type Status } from "@/lib/escrow";

/**
 * The five steps of a rental drawn as a horizontal strip, which is what UI-REFERENCE.md
 * section 3 asks for: somebody should be able to tell where they are without reading.
 *
 * Cancelled and Disputed are not steps on that line, they are places the line stops, so
 * they get a single badge instead of a strip that pretends to continue.
 */
export function StatusStrip({ status }: { status: Status }) {
  if (status === "Cancelled" || status === "Disputed" || status === "None") {
    return (
      <span
        className={`w-fit rounded-full px-2 py-0.5 text-xs tracking-wide uppercase ${STATUS_TONE[status]}`}
      >
        {status}
      </span>
    );
  }

  const current = STATUS_STRIP.indexOf(status as (typeof STATUS_STRIP)[number]);

  return (
    <ol className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
      {STATUS_STRIP.map((step, index) => {
        const done = index < current;
        const here = index === current;
        return (
          <li key={step} className="flex items-center gap-2">
            <span
              className={
                here
                  ? `rounded-full px-2 py-0.5 tracking-wide uppercase ${STATUS_TONE[step]}`
                  : done
                    ? "text-ink"
                    : "text-ink-muted"
              }
            >
              {step === "Active" ? "In use" : step}
            </span>
            {index < STATUS_STRIP.length - 1 && (
              /* Drawn as a rule rather than typed as a character: the dash that reads
                 best here is an em dash, and those are banned across this project. */
              <span
                className={`h-px w-4 ${done ? "bg-ink" : "bg-line"}`}
                aria-hidden
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}

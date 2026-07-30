import Link from "next/link";
import { targetChain } from "@/lib/chain";

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-line">
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-x-4 gap-y-1 px-6 py-6 text-xs text-ink-muted">
        <span>Trustfall</span>
        <span aria-hidden>·</span>
        <span>{targetChain.name}</span>
        <span aria-hidden>·</span>
        {/* Say it plainly. Somebody will try to work out what the USDC is worth. */}
        <span>Test network. The money is not real.</span>
        <Link href="/dev" className="ml-auto underline decoration-line">
          Dev tools
        </Link>
      </div>
    </footer>
  );
}

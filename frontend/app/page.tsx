import Link from "next/link";

/**
 * Placeholder. This becomes the search page in checkpoint 5, with the filter row and the
 * card grid described in UI-REFERENCE.md section 3.
 */
export default function Home() {
  return (
    <main className="flex flex-col gap-10">
      <section className="max-w-2xl">
        <h1 className="text-5xl">Rent real things, without trusting anyone.</h1>
        <p className="mt-4 text-ink-muted">
          Rent and deposit sit in a smart contract, not in a company&apos;s bank account.
          Both sides confirm the handover by scanning a code. If something goes wrong on
          the way back, the deposit is split by rules that were fixed before either side
          agreed to anything.
        </p>
      </section>

      <section className="rounded-card border border-line bg-surface p-6">
        <h2 className="text-lg">Nothing to browse yet</h2>
        <p className="mt-2 max-w-xl text-sm text-ink-muted">
          Listings arrive in checkpoint 4, and this page becomes the search screen in
          checkpoint 5. What works today is the escrow contract, signing in, and the
          network handling.
        </p>
        <Link
          href="/dev"
          className="mt-4 inline-block rounded-control border border-line px-3 py-1.5 text-sm"
        >
          Open dev tools
        </Link>
      </section>
    </main>
  );
}

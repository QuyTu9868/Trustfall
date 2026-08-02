"use client";

import { usePrivy } from "@privy-io/react-auth";
import Link from "next/link";
import { use } from "react";
import { RentalCard } from "@/components/rental-card";
import { useMyRentals } from "@/lib/use-my-rentals";

/**
 * One rental, on its own page.
 *
 * The profile lists rentals; this is where you act on one. Splitting them apart is what
 * makes a notification useful: a bell that says somebody is waiting can now open the exact
 * conversation rather than a page with six rentals on it and no clue which one it meant.
 *
 * It reads the same list as the profile and picks one out, rather than fetching a single
 * rental. The contract keeps no index by address, so finding out whether this rental is
 * yours means reading them all anyway, and one code path is one answer.
 */
export default function RentalPage(props: { params: Promise<{ id: string }> }) {
  const { id } = use(props.params);
  const { ready, authenticated, login } = usePrivy();
  const { rentals, loading, refetch } = useMyRentals();

  if (!ready) return <p className="text-sm text-ink-muted">Loading...</p>;

  if (!authenticated) {
    return (
      <main className="flex flex-col gap-4">
        <h1 className="text-3xl">Rental #{id}</h1>
        <p className="max-w-xl text-sm text-ink-muted">Sign in to see this rental.</p>
        <button
          onClick={login}
          className="w-fit rounded-control bg-ink-strong px-4 py-2 text-sm text-white"
        >
          Sign in
        </button>
      </main>
    );
  }

  const rental = rentals.find((entry) => entry.id.toString() === id);

  return (
    <main className="flex max-w-[76rem] flex-col gap-6">
      <Link href="/profile" className="w-fit text-sm text-ink-muted underline decoration-line">
        Back to your profile
      </Link>

      {loading && !rental && <p className="text-sm text-ink-muted">Reading the chain...</p>}

      {/* Not yours, or not a rental at all. Both look the same from here on purpose:
          confirming that rental 7 exists but belongs to somebody else tells a stranger
          more than they need to know. */}
      {!loading && !rental && (
        <p className="text-sm text-ink-muted">
          No rental #{id} on this wallet. It may belong to your other account.
        </p>
      )}

      {rental && <RentalCard rental={rental} onChanged={() => refetch()} />}
    </main>
  );
}

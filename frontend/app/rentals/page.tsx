"use client";

import Link from "next/link";
import { usePrivy } from "@privy-io/react-auth";
import { RentalCard } from "@/components/rental-card";
import { useMyRentals } from "@/lib/use-my-rentals";

/**
 * Every rental this wallet is part of, on either side, newest first.
 *
 * Read straight from the chain rather than from Supabase. The contract is the only thing
 * that actually knows the state of a rental, and mirroring it into a database would give
 * two answers that can disagree.
 */
export default function RentalsPage() {
  const { ready, authenticated, login } = usePrivy();
  const { rentals, loading, refetch } = useMyRentals();

  if (!ready) {
    return <p className="text-sm text-ink-muted">Loading...</p>;
  }

  if (!authenticated) {
    return (
      <main className="flex flex-col gap-4">
        <h1 className="text-3xl">Rentals</h1>
        <p className="max-w-xl text-sm text-ink-muted">
          Sign in to see the rentals you are part of, on either side.
        </p>
        <button
          onClick={login}
          className="w-fit rounded-control bg-ink-strong px-4 py-2 text-sm text-white"
        >
          Sign in
        </button>
      </main>
    );
  }

  return (
    <main className="flex max-w-3xl flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-3xl">Rentals</h1>
        <p className="text-sm text-ink-muted">
          Read from the contract, not from a database, so this is the real state.
        </p>
      </header>

      {loading && rentals.length === 0 && (
        <p className="text-sm text-ink-muted">Reading the chain...</p>
      )}

      {!loading && rentals.length === 0 && (
        <p className="text-sm text-ink-muted">
          Nothing yet.{" "}
          <Link href="/" className="underline decoration-line">
            Find something to rent
          </Link>
          .
        </p>
      )}

      {rentals.map((rental) => (
        <RentalCard
          key={rental.id.toString()}
          rental={rental}
          onChanged={() => refetch()}
        />
      ))}
    </main>
  );
}

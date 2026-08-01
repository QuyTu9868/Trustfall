"use client";

import { usePrivy } from "@privy-io/react-auth";
import { useState } from "react";
import { useAccount } from "wagmi";
import { ChatThread } from "@/components/chat-thread";
import { RoleTag } from "@/components/role-tag";
import { StatusStrip } from "@/components/status-strip";
import { UnreadBadge } from "@/components/unread-badge";
import { useMyRentals } from "@/lib/use-my-rentals";
import { useUnread } from "@/lib/use-unread";

/**
 * Every conversation this wallet is part of, in one place.
 *
 * The list of threads comes from the chain rather than from the messages table, because a
 * rental with nothing said in it yet is still a conversation somebody may want to start.
 * Keying the inbox off existing messages would hide exactly the thread that needs opening.
 */
export default function MessagesPage() {
  const { ready, authenticated, login } = usePrivy();
  const { rentals, loading } = useMyRentals();
  const { address } = useAccount();
  const unread = useUnread();
  const [openId, setOpenId] = useState<bigint | null>(null);

  if (!ready) return <p className="text-sm text-ink-muted">Loading...</p>;

  if (!authenticated) {
    return (
      <main className="flex flex-col gap-4">
        <h1 className="text-3xl">Messages</h1>
        <p className="max-w-xl text-sm text-ink-muted">
          Sign in to see conversations about the things you are renting or lending.
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

  const selected = rentals.find((rental) => rental.id === openId) ?? rentals[0];

  return (
    <main className="flex max-w-5xl flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-3xl">Messages</h1>
        <p className="text-sm text-ink-muted">
          One conversation per rental, with whoever is on the other side of it.
        </p>
      </header>

      {loading && rentals.length === 0 && (
        <p className="text-sm text-ink-muted">Reading the chain...</p>
      )}

      {!loading && rentals.length === 0 && (
        <p className="text-sm text-ink-muted">
          No rentals yet, so there is nobody to talk to.
        </p>
      )}

      {rentals.length > 0 && selected && (
        <div className="grid gap-6 md:grid-cols-[16rem_1fr]">
          <nav className="flex flex-col gap-1">
            {rentals.map((rental) => {
              const active = rental.id === selected.id;
              return (
                <button
                  key={rental.id.toString()}
                  onClick={() => setOpenId(rental.id)}
                  className={`flex flex-col gap-0.5 rounded-card border px-3 py-2 text-left text-sm ${
                    active ? "border-line bg-surface" : "border-transparent"
                  }`}
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="tabular">Rental #{rental.id.toString()}</span>
                    <UnreadBadge count={unread.counts[rental.id.toString()] ?? 0} />
                  </span>
                  <span className="text-xs text-ink-muted">
                    {rental.status} · with {otherParty(rental, address?.toLowerCase())}
                  </span>
                </button>
              );
            })}
          </nav>

          <section className="flex flex-col gap-4 rounded-card border border-line bg-surface p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <RoleTag owner={selected.owner.toLowerCase() === address?.toLowerCase()} />
                <span className="tabular text-sm">Rental #{selected.id.toString()}</span>
              </div>
              <StatusStrip status={selected.status} />
            </div>
            <ChatThread rentalId={selected.id} />
          </section>
        </div>
      )}
    </main>
  );
}

/** Who the thread is with: the other side, whichever side that is. */
function otherParty(rental: { owner: string; renter: string }, me: string | undefined) {
  const other = rental.owner.toLowerCase() === me ? rental.renter : rental.owner;
  return `${other.slice(0, 6)}...${other.slice(-4)}`;
}

import type { Metadata } from "next";
import Link from "next/link";
import { Reveal } from "@/components/reveal";

export const metadata: Metadata = {
  title: "Presentation - Trustfall",
  description:
    "Rent real things with the money held by a smart contract and the arguments settled by an AI agent that cannot pay itself.",
};

const ESCROW_ADDRESS = "0xf135EB8aBC8d058e0be8e293DF478DE3287CF2DD";
const USDC_ADDRESS = "0xdAdE9118F11fc7b57d115ee45bf282aC12F01BBf";

/**
 * The page built for a judge, not a renter. /homepage sells the product; this one shows the
 * work, in the order a reviewer actually checks a submission: what problem is this, what
 * stops the agent from doing damage, and where can I go look for myself.
 *
 * Reuses the same Reveal / design-token system as the landing page rather than a fresh look,
 * because a submission that looks like two different apps stitched together reads as two
 * people's work rather than one.
 */
export default function PresentationPage() {
  return (
    <main className="flex flex-col gap-24 pb-12">
      <section className="flex flex-col gap-6 pt-8 md:pt-16">
        <Reveal className="flex flex-col gap-6">
          <p className="text-sm tracking-wide text-ink-muted uppercase">
            Built for Rialo
          </p>
          <h1 className="max-w-4xl text-5xl leading-[1.1] md:text-7xl">
            An AI agent that can rule on your money, and never touch it.
          </h1>
          <p className="max-w-2xl text-lg text-ink-muted">
            Trustfall is a rental marketplace where the rent and deposit sit in a smart
            contract, not with the company. When two sides argue over a returned item, a
            language model reads the evidence and proposes a verdict. It never holds a key
            and never states an amount. Every command it sends has to pass a policy gateway
            first, and the contract still does the arithmetic itself.
          </p>
        </Reveal>

        <Reveal delayMs={120} className="flex flex-wrap items-center gap-4">
          <a
            href="https://trustfall-latch.vercel.app"
            target="_blank"
            rel="noreferrer"
            className="rounded-full bg-ink-strong px-6 py-3 text-sm text-canvas"
          >
            Open the live app
          </a>
          <Link
            href="/admin"
            className="rounded-full border border-line px-6 py-3 text-sm text-ink-strong"
          >
            Read the real agent log
          </Link>
        </Reveal>
      </section>

      <section className="flex flex-col gap-8">
        <Reveal>
          <h2 className="text-3xl md:text-4xl">One proposal, three layers before it becomes real.</h2>
          <p className="mt-3 max-w-2xl text-ink-muted">
            An agent that can be prompted into doing something is not a reason to keep it away
            from money. It is a reason to make sure nothing it says is the last word.
          </p>
        </Reveal>

        <div className="grid gap-px overflow-hidden rounded-card border border-line bg-line md:grid-cols-4">
          {LAYERS.map((layer, index) => (
            <Reveal key={layer.title} delayMs={index * 90} className="flex flex-col gap-2 bg-surface p-6">
              <span className="text-xs tracking-wide text-ink-muted uppercase">
                {index + 1}. {layer.who}
              </span>
              <h3 className="font-display text-xl">{layer.title}</h3>
              <p className="text-sm text-ink-muted">{layer.body}</p>
            </Reveal>
          ))}
        </div>

        <Reveal delayMs={200}>
          <div className="flex flex-col gap-4 rounded-card border border-line bg-surface p-8">
            <p className="text-sm">
              The layer worth reading, quoted from the policy itself
              (<code className="text-xs">services/latch/verdict-authority.rs</code>, compiled
              to WASM and run inside Latch):
            </p>
            <blockquote className="border-l-2 border-line pl-4 text-sm text-ink-muted italic">
              &ldquo;The three outcomes do not cost the same when they are wrong. Refunding the
              renter and splitting the deposit both leave the renter holding something.
              Awarding the whole deposit to the owner is the one ruling where being wrong
              costs somebody everything they put up. So the bar scales with the damage: the
              agent may be fairly sure and still move money, but to take all of it, it has to
              be almost certain.&rdquo;
            </blockquote>
            <p className="text-sm text-ink-muted">
              In numbers: every verdict needs 0.6 confidence to be signed at all. Awarding the
              full deposit to the owner needs 0.9. That asymmetry is written once, in Rust, in
              the one place the agent cannot edit it, and it never lowers a bar or names an
              amount, it only ever narrows what the agent is allowed to be sure about.
            </p>
          </div>
        </Reveal>
      </section>

      <section className="flex flex-col gap-8">
        <Reveal>
          <h2 className="text-3xl md:text-4xl">Where the money actually goes.</h2>
        </Reveal>

        <Reveal delayMs={90} className="overflow-x-auto rounded-card border border-line">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead className="bg-surface text-ink-muted">
              <tr>
                <th className="px-5 py-3 font-normal">Step</th>
                <th className="px-5 py-3 font-normal">Who acts</th>
                <th className="px-5 py-3 font-normal">What the contract does</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {RENTAL_STEPS.map((row) => (
                <tr key={row.step}>
                  <td className="px-5 py-3">{row.step}</td>
                  <td className="px-5 py-3 text-ink-muted">{row.who}</td>
                  <td className="px-5 py-3 text-ink-muted">{row.does}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Reveal>
      </section>

      <section className="flex flex-col gap-8">
        <Reveal>
          <h2 className="text-3xl md:text-4xl">When it goes wrong.</h2>
        </Reveal>

        <Reveal delayMs={90}>
          <div className="grid gap-4 sm:grid-cols-3">
            {VERDICTS.map((verdict) => (
              <div key={verdict.name} className="rounded-card border border-line bg-surface p-5">
                <p className="text-sm">{verdict.name}</p>
                <p className="mt-1 text-xs text-ink-muted">{verdict.body}</p>
              </div>
            ))}
          </div>
        </Reveal>

        <Reveal delayMs={160}>
          <p className="max-w-2xl text-sm text-ink-muted">
            Below the confidence bar, nothing is signed. There is no human resolver at that
            point, only a person who chooses to step in through <code>/admin</code>, gated by
            a live authenticator code. Left alone, seven days after a dispute opens anyone can
            close it and the deposit returns to the renter, which treats an unjudged dispute as
            the platform&rsquo;s failure rather than the renter&rsquo;s.
          </p>
        </Reveal>
      </section>

      <section className="flex flex-col gap-8">
        <Reveal>
          <h2 className="text-3xl md:text-4xl">What it is built on.</h2>
        </Reveal>

        <div className="grid gap-6 md:grid-cols-2">
          <Reveal delayMs={90} className="overflow-x-auto rounded-card border border-line">
            <table className="w-full text-left text-sm">
              <tbody className="divide-y divide-line">
                {STACK.map((row) => (
                  <tr key={row.layer}>
                    <td className="px-5 py-3 text-ink-muted">{row.layer}</td>
                    <td className="px-5 py-3">{row.what}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Reveal>

          <Reveal delayMs={140} className="flex flex-col gap-3 rounded-card border border-line bg-surface p-6">
            <p className="text-sm text-ink-muted">Deployed and verified on Sepolia</p>
            <a
              href={`https://sepolia.etherscan.io/address/${ESCROW_ADDRESS}#code`}
              target="_blank"
              rel="noreferrer"
              className="text-sm text-ink-strong underline underline-offset-4"
            >
              RentalEscrow &middot; {ESCROW_ADDRESS.slice(0, 6)}&hellip;{ESCROW_ADDRESS.slice(-4)}
            </a>
            <a
              href={`https://sepolia.etherscan.io/address/${USDC_ADDRESS}#code`}
              target="_blank"
              rel="noreferrer"
              className="text-sm text-ink-strong underline underline-offset-4"
            >
              MockUSDC &middot; {USDC_ADDRESS.slice(0, 6)}&hellip;{USDC_ADDRESS.slice(-4)}
            </a>
            <p className="mt-2 text-xs text-ink-muted">
              The contract has no admin function of any kind. No address can move a settled
              deposit, reverse a ruling, or remove a rental.
            </p>
          </Reveal>
        </div>
      </section>

      <section className="flex flex-col gap-8">
        <Reveal>
          <h2 className="max-w-2xl text-3xl md:text-4xl">Two limits worth saying before you ask.</h2>
        </Reveal>

        <div className="grid gap-6 sm:grid-cols-2">
          <Reveal delayMs={90} className="flex flex-col gap-2">
            <h3 className="font-display text-xl">A blockchain cannot verify a physical object.</h3>
            <p className="text-sm text-ink-muted">
              Every photograph is filed by one of the two people arguing. It can be old, a
              screenshot, or generated. What the chain guarantees is that nobody could change
              it after it arrived and that the server wrote the timestamp.
            </p>
          </Reveal>
          <Reveal delayMs={160} className="flex flex-col gap-2">
            <h3 className="font-display text-xl">An agent can be argued with.</h3>
            <p className="text-sm text-ink-muted">
              Chat logs and statements are written by people with an interest in the outcome,
              so everything they wrote is wrapped in tags the policy treats as evidence rather
              than instruction. That holds against a plain attempt to order a verdict.
              &ldquo;Holds against what we tried&rdquo; is not the same as &ldquo;cannot be
              broken&rdquo;.
            </p>
          </Reveal>
        </div>
      </section>

      <section className="flex flex-col items-start gap-6 border-t border-line pt-16">
        <Reveal className="flex flex-col gap-4">
          <h2 className="max-w-2xl text-4xl md:text-5xl">Go look for yourself.</h2>
          <p className="max-w-2xl text-ink-muted">
            List something, rent it from a second account, and take it through a dispute. Every
            step is on chain and every step is reversible until the money moves.
          </p>
        </Reveal>
        <Reveal delayMs={120} className="flex flex-wrap gap-4">
          <a
            href="https://trustfall-latch.vercel.app"
            target="_blank"
            rel="noreferrer"
            className="rounded-full bg-ink-strong px-6 py-3 text-sm text-canvas"
          >
            Open the live app
          </a>
          <Link href="/roadmap" className="rounded-full border border-line px-6 py-3 text-sm text-ink-strong">
            See the roadmap
          </Link>
        </Reveal>
      </section>
    </main>
  );
}

const LAYERS = [
  {
    who: "The agent",
    title: "Proposes",
    body: "Reads the evidence, returns a verdict and a confidence, never an amount, never a key.",
  },
  {
    who: "Latch",
    title: "Reads the request",
    body: "A policy gateway sits in front of both agents. The wrong shape of request never reaches the server at all.",
  },
  {
    who: "The server",
    title: "Signs, or declines",
    body: "Holds the only key. Checks the confidence bar and the evidence again before it signs anything.",
  },
  {
    who: "The contract",
    title: "Does the arithmetic",
    body: "Takes one of three words and a rental id. It looks up the deposit it is already holding and works out the split itself.",
  },
];

const RENTAL_STEPS = [
  { step: "Request", who: "Renter", does: "Takes rent and deposit into escrow, in one signature via USDC permit" },
  { step: "Approve", who: "Owner", does: "Nothing moves" },
  { step: "Check in", who: "Owner signs the code, renter submits it", does: "Starts the clock; rent stays in escrow" },
  {
    step: "Check out",
    who: "Renter signs the code, owner submits it",
    does: "Works out the rent by hours used, pays the owner, refunds the unused days",
  },
  { step: "Dispute", who: "Either side, while renting or just after", does: "Settles the rent, freezes the deposit for the arbitrator" },
  { step: "Settle", who: "The agent, or nobody", does: "Splits the deposit one of three ways, or the timeout returns it to the renter" },
];

const VERDICTS = [
  { name: "Back to the renter", body: "The item came back as agreed." },
  { name: "Split down the middle", body: "Both sides are partly right." },
  { name: "The owner keeps it", body: "The item was damaged or lost. Needs 0.9 confidence." },
];

const STACK = [
  { layer: "Contracts", what: "Solidity 0.8.24, Foundry for tests, Hardhat to deploy and verify" },
  { layer: "Frontend", what: "Next.js 16, wagmi, viem, Tailwind v4" },
  { layer: "Wallet", what: "Privy - embedded wallets from an email, or a browser wallet" },
  { layer: "Off-chain data", what: "Supabase, Postgres and Storage" },
  { layer: "Agents", what: "Google Gemini, gemini-3.5-flash-lite" },
  { layer: "Agent gateway", what: "Latch" },
];

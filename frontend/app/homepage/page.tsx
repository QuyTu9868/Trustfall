import type { Metadata } from "next";
import Image from "next/image";
import { LandingCta } from "@/components/landing-cta";
import { Reveal } from "@/components/reveal";

export const metadata: Metadata = {
  title: "Trustfall - rent real things with on-chain escrow",
  description:
    "Rent and deposit are held by a smart contract. Both sides scan a code to hand over. Disputes are read by an agent that cannot pay itself.",
};

/**
 * The page somebody who is not signed in sees.
 *
 * Written for a judge who has thirty seconds and has read a dozen of these already. The
 * ordinary landing page opens by claiming to be revolutionary; this one opens by naming
 * the problem it is for, because the claim is the part nobody believes.
 *
 * UI-REFERENCE.md section 5 bans motion everywhere in the app and allows it here. What is
 * here is one fade per section, staggered on load for the hero above the fold and driven
 * by actual scroll position for everything under it, so a section three screens down
 * settles into place when it is reached rather than having finished moving before anyone
 * got there.
 */
export default function LandingPage() {
  return (
    <main className="flex flex-col gap-24 pb-12">
      <section className="flex flex-col gap-8 pt-8 md:pt-16">
        <Reveal hero className="flex flex-col gap-6">
          <p className="text-sm tracking-wide text-ink-muted uppercase">
            Escrow for renting real things
          </p>
          <h1 className="max-w-4xl text-5xl leading-[1.1] md:text-7xl">
            Lend your camera to a stranger.
            <br />
            Get it back, or get paid.
          </h1>
          <p className="max-w-2xl text-lg text-ink-muted">
            Trustfall holds the rent and the deposit in a smart contract until both sides
            agree the item changed hands. No company sits in the middle holding your money,
            and nobody has to be trusted for it to work.
          </p>
        </Reveal>

        <Reveal hero delayMs={120} className="flex flex-wrap items-center gap-5">
          <LandingCta />
          <span className="text-sm text-ink-muted">
            An email is enough. A wallet is made for you.
          </span>
        </Reveal>

        <Reveal hero delayMs={220}>
          {/* The one image above the fold, so it loads eagerly. Everything below waits
              until it is scrolled to, which is what next/image does by default. */}
          <Image
            src="/landing/hero.jpg"
            alt="Somebody handing over a rented item"
            width={1600}
            height={1000}
            priority
            sizes="(max-width: 1024px) 100vw, 1200px"
            className="aspect-[16/9] w-full rounded-card border border-line object-cover"
          />
        </Reveal>

        <Reveal hero delayMs={300}>
          <HandoverDiagram />
        </Reveal>
      </section>

      <section className="flex flex-col gap-8">
        <Reveal>
          <h2 className="text-3xl md:text-4xl">Three kinds of thing, one set of rules.</h2>
        </Reveal>

        <div className="grid gap-5 sm:grid-cols-3">
          {CATEGORY_SHOTS.map((shot, index) => (
            <Reveal key={shot.file} delayMs={index * 90} className="flex flex-col gap-3">
              <Image
                src={`/landing/${shot.file}.jpg`}
                alt={shot.alt}
                width={900}
                height={1200}
                sizes="(max-width: 640px) 100vw, 33vw"
                className="aspect-[3/4] w-full rounded-card border border-line object-cover"
              />
              <div className="flex flex-col gap-1">
                <h3 className="font-display text-xl">{shot.title}</h3>
                <p className="text-sm text-ink-muted">{shot.body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-10">
        <Reveal>
          <h2 className="max-w-3xl text-3xl md:text-4xl">
            Four things that are true here and nowhere else you have rented from.
          </h2>
        </Reveal>

        <div className="grid gap-x-10 gap-y-12 sm:grid-cols-2">
          {FEATURES.map((feature, index) => (
            <Reveal key={feature.title} delayMs={index * 90}>
              <article className="flex flex-col gap-3">
                <feature.Mark />
                <h3 className="font-display text-xl">{feature.title}</h3>
                <p className="text-sm leading-relaxed text-ink-muted">{feature.body}</p>
              </article>
            </Reveal>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-8">
        <Reveal>
          <h2 className="text-3xl md:text-4xl">The numbers, before you ask.</h2>
        </Reveal>

        {/* Real constants out of the contract, not testimonials. Nobody has used this yet
            and inventing five star quotes for a demo would undercut the one thing the
            page is arguing, which is that you should not have to take anybody's word. */}
        <div className="grid gap-px overflow-hidden rounded-card border border-line bg-line sm:grid-cols-2 lg:grid-cols-4">
          {NUMBERS.map((entry) => (
            <div key={entry.label} className="flex flex-col gap-1 bg-surface p-6">
              <span className="tabular text-3xl text-ink-strong">{entry.value}</span>
              <span className="text-sm">{entry.label}</span>
              <span className="text-xs text-ink-muted">{entry.note}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-8">
        <Reveal>
          <h2 className="text-3xl md:text-4xl">When it goes wrong.</h2>
        </Reveal>

        <Reveal delayMs={90}>
          <div className="flex flex-col gap-6 rounded-card border border-line bg-surface p-8">
            <p className="max-w-3xl text-ink-muted">
              Either side can open a dispute while the rental is running or just after it
              ends. Both write what happened. An AI agent reads the two accounts and the
              messages, and picks one of exactly three outcomes.
            </p>

            <div className="grid gap-4 sm:grid-cols-3">
              {VERDICTS.map((verdict) => (
                <div key={verdict.name} className="rounded-card bg-canvas p-4">
                  <p className="text-sm">{verdict.name}</p>
                  <p className="mt-1 text-xs text-ink-muted">{verdict.body}</p>
                </div>
              ))}
            </div>

            {/* The part worth putting in a box. An agent that proposes is a different
                thing from an agent that pays, and the difference is the whole design. */}
            <p className="max-w-3xl border-t border-line pt-6 text-sm text-ink-muted">
              The agent never says an amount and never holds a key. It sends one of those
              three words and a rental id. The contract looks up the deposit it is already
              holding and works out the numbers itself. If the agent is unsure, it says so and
              a person decides instead.
            </p>
          </div>
        </Reveal>
      </section>

      <section className="flex flex-col items-start gap-6 border-t border-line pt-16">
        <Reveal className="flex flex-col gap-4">
          <h2 className="max-w-2xl text-4xl md:text-5xl">Put something up, or take something out.</h2>
          <p className="max-w-2xl text-ink-muted">
            List an item, rent one from your other account, and take it all the way through
            a dispute if you like. Every step is on chain, and you can undo any step until
            the money moves.
          </p>
        </Reveal>
        <Reveal delayMs={120}>
          <LandingCta label="Open the app" />
        </Reveal>
      </section>
    </main>
  );
}

/**
 * The three categories the marketplace actually has, with a photograph each.
 *
 * The files in public/landing are flat grey placeholders at the right dimensions. Dropping
 * a real photograph over each one, same name and roughly the same shape, is the whole
 * change: nothing in this file has to move.
 */
const CATEGORY_SHOTS = [
  {
    file: "homes",
    title: "Places",
    alt: "A room available to rent",
    body: "A spare room, a studio, a place to shoot in for an afternoon.",
  },
  {
    file: "vehicles",
    title: "Vehicles",
    alt: "A scooter available to rent",
    body: "Scooters and cars, by the day, with the deposit held until it comes back.",
  },
  {
    file: "clothing",
    title: "Clothing",
    alt: "A dress available to rent",
    body: "Worn once, hanging in a wardrobe, worth more in somebody else's evening.",
  },
];

const NUMBERS = [
  { value: "1%", label: "Platform fee", note: "on completed rentals only" },
  { value: "3 days", label: "Then the deposit returns", note: "if nobody complains" },
  { value: "7 days", label: "To settle a dispute", note: "or it goes back to the renter" },
  { value: "0", label: "Amounts the agent can name", note: "the contract does the maths" },
];

const VERDICTS = [
  { name: "Back to the renter", body: "The item came back as agreed." },
  { name: "Split down the middle", body: "Both sides are partly right." },
  { name: "The owner keeps it", body: "The item was damaged or lost." },
];

/**
 * Line drawings rather than photographs or an icon font.
 *
 * A stroked SVG is a few hundred bytes, needs no request, and takes the text colour, so it
 * cannot fall out of step with the palette the way a coloured asset does.
 */
function Mark({ children }: { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 48 48"
      className="size-9 stroke-ink-strong"
      fill="none"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {children}
    </svg>
  );
}

const FEATURES = [
  {
    title: "The money is not ours to lose",
    body: "Rent and deposit go straight into a contract on chain. Trustfall cannot spend them, freeze them, or go under holding them. You can read the code that decides where they end up.",
    Mark: () => (
      <Mark>
        <rect x="8" y="18" width="32" height="22" rx="3" />
        <path d="M16 18v-5a8 8 0 0 1 16 0v5" />
        <circle cx="24" cy="29" r="2.5" />
      </Mark>
    ),
  },
  {
    title: "Handover is a scan, not a promise",
    body: "Collecting and returning the item are each confirmed by scanning a code the other person is holding. The code carries a signature that expires, so an old screenshot is worth nothing.",
    Mark: () => (
      <Mark>
        <path d="M10 18v-6a2 2 0 0 1 2-2h6M38 18v-6a2 2 0 0 0-2-2h-6M10 30v6a2 2 0 0 0 2 2h6M38 30v6a2 2 0 0 1-2 2h-6" />
        <path d="M14 24h20" />
      </Mark>
    ),
  },
  {
    title: "An agent that proposes, never pays",
    body: "Disputes are read by a language model that returns one of three words. Every request it makes passes a policy gateway first, the server holds the only key, and the contract checks again before it moves anything.",
    Mark: () => (
      <Mark>
        <rect x="12" y="16" width="24" height="20" rx="4" />
        <path d="M24 16v-6M18 26h.02M30 26h.02" />
        <path d="M4 24h4M40 24h4" />
      </Mark>
    ),
  },
  {
    title: "Both sides get reviewed",
    body: "The renter rates the owner and the owner rates the renter, and neither can be written until the rental is finished and the money has moved. A review here costs something to earn.",
    Mark: () => (
      <Mark>
        <path d="M24 10l4.2 8.9 9.8 1.4-7 7 1.6 9.7-8.6-4.6-8.6 4.6 1.6-9.7-7-7 9.8-1.4z" />
      </Mark>
    ),
  },
];

/**
 * The five states a rental moves through, drawn once so the shape of the thing is visible
 * before anybody signs in. It is the same strip the rental page shows, which is deliberate:
 * the landing page should not describe a product that looks different once you are inside.
 */
function HandoverDiagram() {
  const steps = ["Requested", "Approved", "Renting", "Returned", "Settled"];
  return (
    <ol className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-card border border-line bg-surface px-6 py-5 text-sm">
      {steps.map((step, index) => (
        <li key={step} className="flex items-center gap-3">
          <span className={index === 0 ? "text-ink-strong" : "text-ink-muted"}>{step}</span>
          {index < steps.length - 1 && (
            <span className="text-line" aria-hidden>
              &rarr;
            </span>
          )}
        </li>
      ))}
      <li className="ml-auto text-xs text-ink-muted">
        Money moves at Renting and at Settled, nowhere else.
      </li>
    </ol>
  );
}

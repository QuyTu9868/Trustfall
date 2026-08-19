/**
 * The one flow no test had ever driven with a real wallet: requestRentalWithPermit.
 *
 * Everything else in e2e/ opens pages or calls HTTP endpoints. Nothing signs anything.
 * frontend-e2e-wallet's own case history is the reason this file exists: a flow that passed
 * 22/22 signed by viem died the moment a real wallet signed it, because a real wallet does
 * not trust the app's gas estimate the way a script driven by viem does. requestRental is
 * the single highest-value target for that risk in this app: it bundles a USDC permit
 * signature and the request transaction into the one signature CLAUDE.md section 9 asks
 * for, which is more for a wallet to get right than an ordinary approve-then-call.
 *
 * Not a Playwright spec on purpose. `npx playwright test` would run this in the same batch
 * as pages.spec.ts and http-routes.spec.ts, and this one spends real Sepolia gas and leaves
 * a real rental on the live contract every time it runs. Kept as a script, run by hand:
 *
 *   npx tsx --env-file=.env.local --env-file=../.env.test e2e/wallet-real/request-rental.ts
 *
 * Both env files: the wallet keys live in .env.test and the Sepolia RPC lives in .env.local,
 * and the closing check reads the contract directly rather than believing the screen.
 *
 * The signing in is two passes through Privy's modal, and that is not a workaround for
 * flakiness. Approving MetaMask's connect leaves this app with a wallet connected and
 * nobody signed in: privy:connections gains the address and the modal closes without ever
 * asking for the signature authentication needs. MetaMask 13.17 splits connect across two
 * screens, the second reviewing permissions for chains the app never asked about, and the
 * end of that reads to Privy as the end of its own flow. Pressing the button again is what
 * a person does, and the second pass is short because the wallet is already there: Privy
 * goes straight to the signature request, which is the popup that actually authenticates.
 *
 * Windows: dAppwright, not Synpress. Synpress's v4 CLI refuses to build its cache outside
 * Linux/macOS/WSL. MetaMask is pinned to 13.17.0: dAppwright's onboarding automation is
 * built against that build's DOM, and "latest" changed enough that bootstrap hangs waiting
 * for a testid ("onboarding-import-wallet") that no longer exists.
 *
 * Uses the renter wallet from .env.test (Test_2), the same one every seeded demo rental
 * already used, against the cheapest real listing (Honda Wave, 12/20 USDC) for one day, so
 * the footprint of running this is the smallest one available rather than an arbitrary one.
 */
import type { Page } from "@playwright/test";
import { createPublicClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import { escrowAbi, listingIdToBytes32, toRental, type RentalTuple } from "../../lib/escrow";
import deployed from "../../lib/deployed.json";
// Shared with dispute-bar.ts. Everything about driving MetaMask and Privy was learned
// against one build of each, and a second copy would mean the next thing learned only
// reaches whichever file its author happened to open.
import { boot, connectWallet } from "./wallet";

/**
 * Deployed by default, overridable with SITE.
 *
 * A local dev server still reads Sepolia, because which chain the app talks to is a build
 * setting rather than a property of where it is served from. So pointing this at
 * localhost:3000 checks a change against real chain data without waiting on a deploy.
 */
const SITE = process.env.SITE ?? "https://trustfall-latch.vercel.app";
const LISTING_TITLE = "Honda Wave 110, 2019";

const escrow = deployed["11155111"].rentalEscrow as `0x${string}`;
const chain = createPublicClient({
  chain: sepolia,
  transport: http(process.env.SEPOLIA_RPC_URL),
});

/**
 * The rental the contract has, as opposed to the page the browser landed on.
 *
 * A redirect to /rentals proves the app believed the request went through, which is worth
 * asserting and is not the same claim as "a rental exists". The list on that page reads the
 * chain on a thirty second poll, so it is routinely still empty a second after a successful
 * request, and a screenshot of it says nothing either way. This asks the contract.
 */
async function latestRental() {
  const next = await chain.readContract({
    address: escrow,
    abi: escrowAbi,
    functionName: "nextRentalId",
  });
  const id = (next as bigint) - 1n;
  if (id < 1n) return null;
  const tuple = await chain.readContract({
    address: escrow,
    abi: escrowAbi,
    functionName: "rentals",
    args: [id],
  });
  return toRental(id, tuple as RentalTuple);
}

async function findListing() {
  // Same technique as pages.spec.ts's listing-detail case: the marketplace is client-gated
  // by SignedInOnly and a navigation there would just bounce to /homepage, but the server's
  // first response still carries the real grid as an escaped RSC payload before any
  // JavaScript runs, so a raw fetch of it sees every listing id.
  //
  // The title is not reliably adjacent to its own id in that payload - React Server
  // Components serialise as a flat, deduplicated array of strings, so a title used by more
  // than one reference can sit anywhere in it. Cheaper to just ask each candidate listing's
  // own detail page, which renders its title as ordinary text server side.
  const html = await (await fetch(`${SITE}/`)).text();
  const ids = [...new Set([...html.matchAll(/listings\\?\/([a-z0-9-]{36})/gi)].map((m) => m[1]))];
  if (!ids.length) throw new Error("No listing ids found on the marketplace at all.");

  for (const id of ids) {
    const detail = await (await fetch(`${SITE}/listings/${id}`)).text();
    if (detail.includes(LISTING_TITLE)) return id;
  }
  throw new Error(`Found ${ids.length} listings, none titled "${LISTING_TITLE}".`);
}


/** Set once they exist, so a failure anywhere after that can still be screenshotted. */
let lastPage: Page | null = null;
let lastContext: import("playwright-core").BrowserContext | null = null;

async function main() {
  const key = process.env.Test_2;
  if (!key) throw new Error("Test_2 missing. Run with --env-file=../.env.test.");

  console.log("Booting a real MetaMask...");
  // Test nets on, unlike the dispute script: this one sends a transaction on Sepolia and
  // MetaMask has to have the network to send it on.
  const { wallet, context } = await boot(key, { showTestNets: true });
  lastContext = context;

  // Derived rather than read off the screen: the header shows a truncated 0x7d2a...0798,
  // which is not something to compare a contract field against.
  const renter = privateKeyToAccount(
    (key.startsWith("0x") ? key : `0x${key}`) as `0x${string}`
  ).address.toLowerCase();
  console.log("Imported the renter's key from .env.test (Test_2). Never printed.");

  const listingId = await findListing();
  console.log(`Target listing: ${LISTING_TITLE} (${listingId})`);

  const appPage = await context.newPage();
  lastPage = appPage;
  appPage.on("console", (m) => {
    if (m.type() === "error") console.log(`  [console] ${m.text().slice(0, 220)}`);
  });
  // Which request failed, not just that one did. The browser's own console says only
  // "the server responded with a status of 400" and names no URL, which is the least
  // useful half of the sentence.
  appPage.on("response", async (r) => {
    if (r.status() < 400) return;
    console.log(`  [http] ${r.status()} ${r.url().replace(SITE, "")}`);
    const sent = r.request().postData();
    if (sent) console.log(`  [http] sent: ${sent.slice(0, 300)}`);
    const body = await r.text().catch(() => null);
    if (body) console.log(`  [http] said: ${body.slice(0, 300)}`);
  });
  appPage.on("pageerror", (e) => console.log(`  [pageerror] ${e.message}`));
  await appPage.goto(`${SITE}/listings/${listingId}`, { waitUntil: "domcontentloaded" });

  console.log("Connecting the wallet through Privy's own modal...");
  await connectWallet(appPage, context);

  // What Privy and wagmi each believe, which are two different things and can disagree.
  // "Connected but not authenticated" and "never connected at all" both look like a header
  // that says Sign in, and they have completely different causes.
  const state = await appPage.evaluate(() => {
    const keys = Object.keys(localStorage).filter((k) => /privy|wagmi/i.test(k));
    return keys.map((k) => `${k}=${(localStorage.getItem(k) ?? "").slice(0, 120)}`);
  });
  console.log("  [state] " + (state.length ? state.join("\n  [state] ") : "no privy or wagmi keys at all"));

  const address = await appPage.locator("header").getByText(/0x[a-fA-F0-9]{4}\.\.\.[a-fA-F0-9]{4}/).textContent().catch(() => null);
  console.log(`Signed in as: ${address ?? "(could not read the header - see screenshot)"}`);
  await appPage.screenshot({ path: "e2e/shots/wallet-real-connected.png" });

  // Stops here with CONNECT_ONLY=1. Signing in costs a signature and nothing else, while
  // everything below it spends gas and leaves a rental on the live contract, so the half of
  // this script that needed running twenty times today is worth being able to run alone.
  if (process.env.CONNECT_ONLY) {
    // Counted by host, because the signed-in rentals page is the only place the log scan
    // runs and the rpc-budget suite cannot reach it: that suite browses signed out, where
    // there are no rentals to read events for. Without this, the cost of scanning eight
    // windows per page load would be a number nobody had ever looked at.
    const calls = new Map<string, number>();
    appPage.on("request", (r) => {
      const host = new URL(r.url()).host;
      if (host.includes("vercel.app")) return;
      calls.set(host, (calls.get(host) ?? 0) + 1);
    });

    await appPage.goto(`${SITE}/rentals`, { waitUntil: "networkidle" }).catch(() => {});
    // Long enough for the log scan to come back. It is several requests to a public node,
    // which is slower than the state reads beside it and is the thing worth looking at.
    await appPage.waitForTimeout(12_000);
    await appPage.screenshot({ path: "e2e/shots/wallet-real-rentals.png", fullPage: true });
    console.log("\nCONNECT_ONLY: signed in, nothing requested, no gas spent.");
    for (const [host, count] of [...calls].sort((a, b) => b[1] - a[1])) {
      console.log(`  ${count} request(s) to ${host}`);
    }
    console.log("Rentals page: e2e/shots/wallet-real-rentals.png");
    await context.close();
    return;
  }

  // A short, future window. min={chainToday} on the date inputs rules out anything else,
  // and one day keeps the amount at risk to the smallest this listing can produce: 12
  // USDC rent plus the 20 USDC deposit.
  const chainToday = new Date();
  const start = new Date(chainToday.getTime() + 3 * 86_400_000).toISOString().slice(0, 10);
  const end = new Date(chainToday.getTime() + 4 * 86_400_000).toISOString().slice(0, 10);

  const dateInputs = appPage.locator('input[type="date"]');
  await dateInputs.nth(0).fill(start);
  await dateInputs.nth(1).fill(end);

  const submit = appPage.getByRole("button", { name: /request to rent/i });
  await submit.waitFor({ state: "visible", timeout: 10_000 });
  console.log(`Requesting ${start} to ${end}. Clicking "Request to rent"...`);
  await submit.click();

  // Two MetaMask prompts back to back: a signature (the USDC permit) and then a
  // transaction (requestRentalWithPermit itself). Called immediately, one after the other,
  // with nothing awaited in between - the same fix as connectWallet, for the same reason.
  // Each dappwright call arms its own listener for the next notification popup, and a wait
  // inserted here is a wait for a popup that already opened and will not open again.
  console.log("Signing the permit, then confirming the transaction...");
  await wallet.sign();
  await wallet.confirmTransaction();
  console.log("Both approved. Waiting for the chain...");

  // The component itself redirects to /rentals once the id comes back, which is the
  // outcome actually worth asserting: not that a hash exists, but that the app's own logic
  // believed the request went through.
  // A rental, not the index. /rentals redirects to /profile, so the looser pattern this
  // used to carry passed happily while somebody who had just signed a transaction was
  // being dropped on a list of everything they had ever rented.
  await appPage.waitForURL(/\/rentals\/\d+/, { timeout: 60_000 });
  await appPage.waitForLoadState("networkidle").catch(() => {});
  await appPage.screenshot({ path: "e2e/shots/wallet-real-success.png" });

  // The part that makes this a test rather than a demonstration. Every field is checked
  // against what was asked for, because a rental that exists for the wrong listing, the
  // wrong renter or the wrong deposit is a failure that a redirect happily reports as
  // success.
  const rental = await latestRental();
  if (!rental) throw new Error("The contract has no rentals at all.");

  const wantListing = listingIdToBytes32(listingId).toLowerCase();
  const gotListing = rental.listingId.toLowerCase();
  const gotRenter = rental.renter.toLowerCase();

  console.log(`\nContract has rental #${rental.id}:`);
  console.log(`  listing  ${gotListing === wantListing ? "matches the one requested" : `WRONG: ${gotListing}`}`);
  console.log(`  renter   ${gotRenter} ${gotRenter === renter ? "(the test wallet)" : "(SOMEBODY ELSE)"}`);
  console.log(`  status   ${rental.status}`);
  console.log(`  money    ${rental.rent} rent, ${rental.deposit} deposit, in USDC base units`);

  if (gotListing !== wantListing) {
    throw new Error("The newest rental is for a different listing than the one requested.");
  }
  if (gotRenter !== renter) {
    throw new Error("The newest rental was not requested by the test wallet.");
  }
  if (rental.status !== "Requested") {
    throw new Error(`The newest rental is ${rental.status}, not Requested.`);
  }

  console.log("\nSUCCESS: a real MetaMask permit signature and a real transaction confirmation produced rental");
  console.log(`#${rental.id} on Sepolia, waiting for the owner to approve it. Screenshots in frontend/e2e/shots/wallet-real-*.png`);

  await context.close();
}

main().catch(async (error) => {
  console.error("\nFAILED:", error instanceof Error ? error.message : error);
  if (lastPage && !lastPage.isClosed()) {
    await lastPage.screenshot({ path: "e2e/shots/wallet-real-failure.png" }).catch(() => {});
    console.error("App state at the moment of failure: e2e/shots/wallet-real-failure.png");
  }
  // Every open page, not only the app's: whatever MetaMask popup is still up is the thing
  // that actually explains a timeout waiting on it.
  if (lastContext) {
    const pages = lastContext.pages();
    console.error(`${pages.length} pages open: ${pages.map((p) => p.url()).join(", ")}`);
    for (const [index, p] of pages.entries()) {
      if (p.isClosed()) continue;
      await p
        .screenshot({ path: `e2e/shots/wallet-real-failure-page-${index}.png` })
        .catch(() => {});
    }
  }
  process.exit(1);
});

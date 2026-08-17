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
import dappwright from "@tenkeylabs/dappwright";
import type { Page } from "@playwright/test";
import { createPublicClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import { escrowAbi, listingIdToBytes32, toRental, type RentalTuple } from "../../lib/escrow";
import deployed from "../../lib/deployed.json";

const SITE = "https://trustfall-latch.vercel.app";
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

/**
 * Clicks a popup's confirm-btn through however many screens it turns out to have, and
 * closes when the popup does.
 *
 * How many is not knowable in advance. MetaMask 13.17.0's connect flow is two screens, an
 * account picker and then "Review permissions" for the multichain networks it now bundles
 * by default (Bitcoin, Solana, Tron alongside the EVM one this app actually asked for).
 * dappwright's own approve() assumes one screen: it clicks confirm-btn once and waits for
 * the popup to close, which never happens here because a second screen with its own
 * confirm-btn has just replaced the first inside the same popup. Looping the same click
 * until the popup itself closes works for either shape without hardcoding which this
 * build shows.
 */
// MetaMask does not use one testid for "the button that moves this screen forward". The
// account picker and a plain message signature are confirm-btn and confirm-footer-button
// respectively, per dappwright's own source, and that much matches what runs here. But the
// "Review permissions" screen this MetaMask build shows for its multichain networks
// (Bitcoin, Solana, Tron alongside the EVM chain this app actually asked for) has neither:
// its "Confirm" button carries some other testid dappwright 2.13.12 was never taught,
// because the multichain UI postdates it. The button's visible text is the one thing that
// has held constant across every screen seen so far, so that is the fallback rather than a
// third guessed testid.
const CONFIRM_TESTIDS = ["confirm-btn", "confirm-footer-button"];

/**
 * The real MetaMask popup, as opposed to a decoy with the same URL prefix.
 *
 * The first "page" event this script ever caught was a notification.html with no route
 * after it - no #/connect/..., nothing - and it sat on the loading spinner for the entire
 * length of every timeout tried, never once resolving. Manifest V3 MetaMask appears to open
 * more than one extension page around a connect request, and only the one that gets an
 * actual hash route is the interactive one; the other is not something clicking through
 * will ever finish. Polling context.pages() for a URL that already has a route sidesteps
 * the question of which "page" event fired first and picks the one actually worth clicking.
 */
async function findRoutedPopup(
  context: import("playwright-core").BrowserContext,
  timeoutMs = 20_000
) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const routed = context
      .pages()
      .find((p) => /notification\.html#\/./.test(p.url()) && !p.isClosed());
    if (routed) return routed;
    await new Promise((r) => setTimeout(r, 400));
  }
  return null;
}

async function clickThroughPopup(popup: Page, label: string) {
  console.log(`  [${label}] popup url: ${popup.url()}`);
  for (let round = 0; round < 5 && !popup.isClosed(); round++) {
    // MetaMask's own splash (the fox and a spinner) sits on screen well past
    // domcontentloaded while it fetches account state to show, apparently against its own
    // default RPC rather than anything this app configures. The first version of this loop
    // gave up after 2.5s per testid and concluded there was nothing to click, which was
    // wrong: there was, it just had not rendered yet. One locator for either testid with a
    // generous wait replaces two short ones, so a slow popup gets the time it needs instead
    // of being abandoned mid-load.
    // waitFor, not isVisible: isVisible() is an immediate, non-retrying check despite
    // taking a timeout option, and every earlier version of this loop was using it to mean
    // "wait up to N seconds", which it does not do. That is almost certainly why a button
    // plainly visible in the screenshot taken a moment later kept being reported as absent.
    // waitFor({state: "visible"}) is the one that actually polls.
    const confirm = popup
      .getByTestId(CONFIRM_TESTIDS[0])
      .or(popup.getByTestId(CONFIRM_TESTIDS[1]))
      .or(popup.getByRole("button", { name: /^confirm$/i }));
    const ready = await confirm
      .waitFor({ state: "visible", timeout: 12_000 })
      .then(() => true)
      .catch((e) => {
        console.log(`  [${label}] locator error: ${e.message.split("\n")[0]}`);
        return false;
      });
    await popup
      .screenshot({ path: `e2e/shots/wallet-real-${label}-round${round}.png` })
      .catch((e) => console.log(`  [${label}] screenshot failed round ${round}: ${e.message}`));
    console.log(`  [${label}] round ${round}: ${ready ? "clicking a confirm button" : "no confirm button appeared"}`);
    if (!ready) break;
    // Both of these throw rather than return once the popup goes away, and the last click
    // of a successful run is precisely the one that makes it go away. Treating that as a
    // failure aborted the whole script at the moment it had actually just succeeded.
    await confirm.click().catch(() => {});
    await popup.waitForTimeout(1200).catch(() => {});
  }
}

async function connectWallet(page: Page, context: import("playwright-core").BrowserContext) {
  // Armed before the click, not after: a popup listener only fires for a popup that opens
  // after the listener exists, which is the exact bug the skill's own history warns about
  // from the two-signature approve+pay flow.
  /**
   * Opens Privy's modal and walks it as far as handing off to MetaMask.
   *
   * Called more than once on purpose. Approving MetaMask's connect leaves this app with a
   * wallet connected and nobody signed in: privy:connections gains the address, wagmi's
   * store gains the account, and the modal closes without ever asking for the signature
   * that authentication actually needs. MetaMask 13.17 splits its connect across two
   * screens, the second of which reviews permissions for chains the app never asked about,
   * and Privy treats the end of that as the end of its own flow.
   *
   * A person hitting this presses the button again, and the second pass is short because
   * the wallet is already connected: Privy goes straight to the signature. This does the
   * same rather than pretending one pass is enough.
   */
  const openModal = async (attempt: number) => {
    const label = `attempt${attempt}`;
    await page.getByRole("button", { name: /^sign in$/i }).click();

    // waitFor, never isVisible. isVisible() answers immediately about this instant and is
    // false for a modal still animating in, so a version of this built on it silently
    // skipped both clicks and left the flow parked on the first screen with nothing in the
    // log to say why. The whole point of these being optional is that a later pass may
    // open past them, and "not there yet" has to be told apart from "not there".
    const clickIfShown = async (name: RegExp, timeout: number) => {
      const button = page.getByRole("button", { name }).first();
      const shown = await button
        .waitFor({ state: "visible", timeout })
        .then(() => true)
        .catch(() => false);
      if (shown) await button.click().catch(() => {});
      return shown;
    };

    // Generous on the chooser, because on a first pass it is definitely coming and only
    // the animation is in the way. Short on MetaMask, because a later pass can legitimately
    // open straight past the wallet list and should not spend ten seconds finding that out.
    await clickIfShown(/continue with a wallet/i, 15_000);
    await clickIfShown(/metamask/i, 5_000);

    await page.screenshot({ path: `e2e/shots/wallet-real-${label}.png` }).catch(() => {});
    console.log(`  [modal] ${label}: ${await page.locator("[role='dialog']").count()} dialog(s)`);
  };

  await openModal(1);

  // Privy issues more than one wallet request while it finishes signing somebody in, and
  // not always the same number twice: a connect, a permissions review, a session signature,
  // and in at least one run of this script a second connect that went all the way back to
  // the account picker. Waiting for a fixed number of popups or a fixed idle gap between
  // them both guessed wrong in practice. What actually ends is the app itself no longer
  // showing "Sign in", so that is what this waits for, servicing whatever routed popup
  // shows up while it waits rather than assuming the count in advance.
  const seen = new Set<Page>();
  const deadline = Date.now() + 150_000;
  let sweep = 0;
  let attempts = 1;
  while (Date.now() < deadline) {
    const stillSignedOut = await page
      .getByRole("button", { name: /^sign in$/i })
      .count();
    if (stillSignedOut === 0) break;

    // Signed out with the modal gone means the flow ended without finishing. Start it
    // again rather than spending the rest of the deadline waiting for a popup that no
    // longer has anything to open it.
    const dialogs = await page.locator("[role='dialog']").count();
    if (dialogs === 0 && attempts < 3) {
      console.log(`  [modal] closed with nobody signed in, reopening (pass ${++attempts})`);
      await openModal(attempts).catch((e) => console.log(`  [modal] reopen failed: ${e.message}`));
    }

    const popup = await findRoutedPopup(context, 5000);
    if (popup && !seen.has(popup)) {
      seen.add(popup);
      await clickThroughPopup(popup, `p${seen.size}`);

      // What the app itself did about it, photographed the moment the popup let go. A
      // connect that MetaMask reports as finished and the app never reacts to is the exact
      // failure this script kept hitting, and the app side of that second was the one thing
      // never captured: every screenshot was of MetaMask, or of the page a minute later
      // once the modal had already given up and closed.
      await page.waitForTimeout(1500);
      await page
        .screenshot({ path: `e2e/shots/wallet-real-app-after-p${seen.size}.png` })
        .catch(() => {});
      const modal = await page.locator("#privy-dialog, [role='dialog']").count();
      console.log(`  [app] after p${seen.size}: ${modal} dialog(s) open`);
    }

    // The Privy modal's own words, once a sweep, so a flow that is stuck waiting on
    // something says which something rather than only failing to finish.
    if (++sweep % 4 === 0) {
      const dialog = page.locator("[role='dialog']").first();
      const text = await dialog.textContent({ timeout: 1000 }).catch(() => null);
      console.log(`  [app] modal says: ${text ? text.slice(0, 160) : "(no dialog)"}`);
    }
  }
}

/** Set once they exist, so a failure anywhere after that can still be screenshotted. */
let lastPage: Page | null = null;
let lastContext: import("playwright-core").BrowserContext | null = null;

async function main() {
  const key = process.env.Test_2;
  if (!key) throw new Error("Test_2 missing. Run with --env-file=../.env.test.");

  console.log("Booting a real MetaMask...");
  const [wallet, page, context] = await dappwright.bootstrap("", {
    wallet: "metamask",
    version: "13.17.0",
    seed: "test test test test test test test test test test test junk",
    headless: false,
    showTestNets: true,
  });

  lastContext = context;

  // MetaMask's unread-notification dot sits on top of the account options button, and
  // dappwright's importPK clicks that button. Once the dot reaches "9+" it is wide enough to
  // cover the target completely, and Playwright refuses a click it can see something else
  // would receive: thirty seconds of retries and then a timeout inside library code with
  // nothing to do with this app. Hiding it beats clearing the notifications, which would
  // mean driving MetaMask's own UI to fix MetaMask's own UI.
  //
  // An init script rather than one addStyleTag, because MetaMask navigates during onboarding
  // and a style attached to the document it had at bootstrap does not survive that. This
  // reapplies itself on every document in the context, popups included.
  // As a source string, not a function. tsx compiles with esbuild, which rewrites named
  // functions to carry a __name() helper that exists in this file's scope and not in the
  // page's, so a function handed to addInitScript arrives referencing an undefined symbol
  // and throws "__name is not defined" on every document instead of running.
  const HIDE_DOT = ".notifications-tag-counter__unread-dot{display:none !important}";
  await context.addInitScript({
    content: `(function(){var add=function(){var s=document.createElement("style");s.textContent=${JSON.stringify(HIDE_DOT)};document.head.appendChild(s)};if(document.head){add()}else{document.addEventListener("DOMContentLoaded",add)}})()`,
  });
  await page.addStyleTag({ content: HIDE_DOT }).catch(() => {});

  await wallet.importPK(key);
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
  await appPage.waitForURL(/\/rentals/, { timeout: 60_000 });
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

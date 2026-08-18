/**
 * Watches the arbitrator actually take its thirty seconds, on a real dispute.
 *
 * The pacing was the first thing asked for and the last thing verified, because seeing it
 * needs a rental that has really been checked in, really been disputed, and really had both
 * sides file. Reading the code proves the arithmetic; only this proves the bar moves and the
 * ruling lands at the end of it.
 *
 *   npx tsx --env-file=.env.local --env-file=../.env.test e2e/wallet-real/dispute-bar.ts
 *
 * Expects the rental named below to be Disputed already, with the OTHER side's statement
 * already filed. Getting it there is chain work with no browser in it. What happens here is
 * the half a person sees: file the second statement through the real form, then watch.
 *
 * This settles a real deposit on Sepolia when the arbitrator rules. That is the point: the
 * whole path runs, agent to Latch to server to contract.
 */
import type { Page } from "@playwright/test";
import { boot, connectWallet } from "./wallet";

const SITE = process.env.SITE ?? "https://trustfall-latch.vercel.app";
const RENTAL = process.env.RENTAL ?? "7";

/** What the bar is expected to pass through, mirroring STAGES in dispute-box.tsx. */
const SAMPLE_EVERY_MS = 5_000;
const WATCH_MS = 150_000;

async function readBar(page: Page) {
  const panel = page.locator("section", { hasText: /the arbitrator is reading it/i }).last();
  if ((await panel.count()) === 0) return null;
  const stage = await panel.locator("span").nth(1).textContent().catch(() => null);
  // The width is the only place the progress actually lives: it is a style, not text, so
  // reading the label alone would report movement that may not be happening.
  const width = await panel
    .locator("div[style*='width']")
    .first()
    .evaluate((node) => (node as HTMLElement).style.width)
    .catch(() => null);
  return { stage: stage?.trim() ?? "?", width: width ?? "?" };
}

async function readRuling(page: Page) {
  for (const phrase of [
    /the whole deposit goes back to the renter/i,
    /the deposit is split down the middle/i,
    /the owner keeps the deposit/i,
  ]) {
    const found = page.getByText(phrase);
    if (await found.count()) return (await found.first().textContent())?.trim() ?? null;
  }
  return null;
}

async function main() {
  const key = process.env.Test_2;
  if (!key) throw new Error("Test_2 missing. Run with --env-file=../.env.test.");

  console.log("Booting a real MetaMask...");
  // No testnet toggle: nothing here sends a transaction. Filing evidence is an HTTP post
  // and signing in is a personal_sign, neither of which needs a network selected.
  const { page, context } = await boot(key, { showTestNets: false });

  const app = await context.newPage();
  app.on("console", (m) => m.type() === "error" && console.log(`  [console] ${m.text().slice(0, 160)}`));
  await app.goto(`${SITE}/rentals/${RENTAL}`, { waitUntil: "domcontentloaded" });
  await page.close().catch(() => {});

  console.log("Signing in...");
  console.log("Signed in as:", (await connectWallet(app, context)) ?? "(header unreadable)");

  const box = app.locator("section", { hasText: /^Dispute/ }).first();
  await box.waitFor({ state: "visible", timeout: 30_000 });

  // Filing through the form, not through the database. The thirty second clock starts from
  // the row this creates, and the nudge that eventually fires the arbitrator is hung off
  // this very request.
  // Waited for, not counted. The form is behind a status the box fetches after it mounts,
  // so counting the moment the box appears asks the question before the answer exists, and
  // reports "already filed" for a form that was merely still loading. Same family of
  // mistake as isVisible(): a check that does not wait, used where waiting was the point.
  const statement = app.getByPlaceholder(/what happened, in your words/i);
  const canFile = await statement
    .waitFor({ state: "visible", timeout: 40_000 })
    .then(() => true)
    .catch(() => false);

  if (!canFile) {
    console.log("No filing form: this side has filed already, or the dispute is over.");
  } else {
    await statement.fill(
      "The scratch was on the left panel when I collected it and the check-in photograph shows it. I did not cause it and I am not paying for it."
    );
    await app.getByRole("button", { name: /^file this$/i }).click();
    console.log("Filed. Both sides are in; the clock starts now.\n");
  }

  const started = Date.now();
  let sawBar = false;
  let ruling: string | null = null;

  while (Date.now() - started < WATCH_MS) {
    const seconds = Math.round((Date.now() - started) / 1000);
    ruling = await readRuling(app);
    if (ruling) {
      console.log(`  +${seconds}s  RULING: ${ruling}`);
      await app.screenshot({ path: "e2e/shots/dispute-ruling.png", fullPage: true });
      break;
    }

    const bar = await readBar(app);
    if (bar) {
      sawBar = true;
      console.log(`  +${seconds}s  bar ${bar.width.padStart(7)}  "${bar.stage}"`);
      if (seconds < 20) {
        await app.screenshot({ path: "e2e/shots/dispute-bar.png", fullPage: true });
      }
    } else {
      console.log(`  +${seconds}s  no bar on screen`);
    }

    await app.waitForTimeout(SAMPLE_EVERY_MS);
  }

  console.log(
    `\n${sawBar ? "The bar was on screen and moving." : "THE BAR NEVER APPEARED."}` +
      ` ${ruling ? `The arbitrator ruled: ${ruling}` : "No ruling within the watch window."}`
  );
  await context.close();
}

main().catch(async (error) => {
  console.error("\nFAILED:", error instanceof Error ? error.message : error);
  process.exit(1);
});

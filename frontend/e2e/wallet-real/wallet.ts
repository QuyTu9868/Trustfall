/**
 * Booting a real MetaMask and getting it signed in, for any script that needs one.
 *
 * Shared rather than copied. Everything in here was learned the hard way against one
 * particular MetaMask build and one particular Privy flow, and a second copy would mean the
 * next thing learned only reaches whichever file its author happened to open.
 *
 * Windows: dAppwright, not Synpress. Synpress's v4 CLI refuses to build its cache outside
 * Linux/macOS/WSL. MetaMask is pinned to 13.17.0 because dAppwright's onboarding automation
 * is built against that build's DOM, and "latest" changed enough that bootstrap hangs
 * waiting for a testid that no longer exists.
 */
import dappwright from "@tenkeylabs/dappwright";
import type { Page } from "@playwright/test";
import type { BrowserContext } from "playwright-core";

/**
 * MetaMask does not use one testid for "the button that moves this screen forward". The
 * account picker and a plain message signature are confirm-btn and confirm-footer-button
 * respectively, per dappwright's own source. But the "Review permissions" screen this build
 * shows for its multichain networks (Bitcoin, Solana, Tron alongside the EVM chain the app
 * actually asked for) has neither: its Confirm button carries some other testid dappwright
 * 2.13.12 was never taught, because the multichain UI postdates it. The visible text is the
 * one thing that has held constant across every screen seen so far.
 */
const CONFIRM_TESTIDS = ["confirm-btn", "confirm-footer-button"];

/**
 * The real MetaMask popup, as opposed to a decoy with the same URL prefix.
 *
 * The first "page" event this ever caught was a notification.html with no route after it,
 * and it sat on the loading spinner for the entire length of every timeout tried. Manifest
 * V3 MetaMask opens more than one extension page around a connect request, and only the one
 * that gets a hash route is interactive. Polling for a URL that already has a route sidesteps
 * the question of which "page" event fired first.
 */
export async function findRoutedPopup(context: BrowserContext, timeoutMs = 20_000) {
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

/** Clicks a popup's confirm through however many screens it turns out to have. */
export async function clickThroughPopup(popup: Page, label: string) {
  console.log(`  [${label}] popup url: ${popup.url()}`);
  for (let round = 0; round < 5 && !popup.isClosed(); round++) {
    // waitFor, not isVisible: isVisible() is an immediate, non-retrying check despite taking
    // a timeout option, and using it here reported buttons as absent that were plainly
    // visible in the screenshot taken a moment later.
    const confirm = popup
      .getByTestId(CONFIRM_TESTIDS[0])
      .or(popup.getByTestId(CONFIRM_TESTIDS[1]))
      .or(popup.getByRole("button", { name: /^confirm$/i }));
    const ready = await confirm
      .waitFor({ state: "visible", timeout: 12_000 })
      .then(() => true)
      .catch(() => false);
    console.log(`  [${label}] round ${round}: ${ready ? "clicking confirm" : "nothing to click"}`);
    if (!ready) break;
    // Both of these throw once the popup goes away, and the last click of a successful run
    // is precisely the one that makes it go away.
    await confirm.click().catch(() => {});
    await popup.waitForTimeout(1200).catch(() => {});
  }
}

/**
 * Signs in through Privy's modal, opening it up to three times.
 *
 * More than one pass on purpose. Approving MetaMask's connect leaves the app with a wallet
 * connected and nobody signed in: privy:connections gains the address and the modal closes
 * without ever asking for the signature authentication needs. A person presses the button
 * again without registering it as a failure; the second pass is short, because Privy goes
 * straight to the signature request, which is the popup that actually authenticates.
 */
export async function connectWallet(page: Page, context: BrowserContext) {
  // The one in the header, not "a button that says Sign in". Signed out, /rentals and
  // /profile carry two of them: the header's and the page's own prompt. An unscoped
  // getByRole matches both, and Playwright's strict mode refuses to guess, so every reopen
  // on those pages died with a strict mode violation and the run ended signed out. That was
  // the flakiness this script was carrying for weeks, and it was never about MetaMask.
  const signIn = page.getByRole("banner").getByRole("button", { name: /^sign in$/i });

  const openModal = async (attempt: number) => {
    await signIn.click();

    // waitFor, never isVisible: a modal still animating in is not visible yet, and these
    // clicks are optional precisely because a later pass may open straight past them.
    const clickIfShown = async (name: RegExp, timeout: number) => {
      const button = page.getByRole("button", { name }).first();
      const shown = await button
        .waitFor({ state: "visible", timeout })
        .then(() => true)
        .catch(() => false);
      if (shown) await button.click().catch(() => {});
    };

    await clickIfShown(/continue with a wallet/i, 15_000);
    await clickIfShown(/metamask/i, 5_000);
    console.log(`  [modal] pass ${attempt}: ${await page.locator("[role='dialog']").count()} dialog(s)`);
  };

  await openModal(1);

  const seen = new Set<Page>();
  const deadline = Date.now() + 150_000;
  let attempts = 1;
  while (Date.now() < deadline) {
    if ((await signIn.count()) === 0) break;

    // Signed out with the modal gone means the flow ended without finishing.
    if ((await page.locator("[role='dialog']").count()) === 0 && attempts < 3) {
      console.log(`  [modal] closed with nobody signed in, reopening (pass ${++attempts})`);
      await openModal(attempts).catch((e) => console.log(`  [modal] reopen failed: ${e.message}`));
    }

    const popup = await findRoutedPopup(context, 5000);
    if (popup && !seen.has(popup)) {
      seen.add(popup);
      await clickThroughPopup(popup, `p${seen.size}`);
      await page.waitForTimeout(1500);
    }
  }

  const address = await page
    .locator("header")
    .getByText(/0x[a-fA-F0-9]{4}\.\.\.[a-fA-F0-9]{4}/)
    .textContent()
    .catch(() => null);
  return address;
}

/**
 * A fresh browser with MetaMask installed and one key imported.
 *
 * showTestNets drives MetaMask's own settings UI, several clicks deep, and it has timed out
 * on the Advanced tab often enough to be worth switching off for anything that does not send
 * a transaction. Signing in only needs a personal_sign, which has no network in it.
 */
export async function boot(privateKey: string, { showTestNets = true } = {}) {
  const [wallet, page, context] = await dappwright.bootstrap("", {
    wallet: "metamask",
    version: "13.17.0",
    seed: "test test test test test test test test test test test junk",
    headless: false,
    showTestNets,
  });

  // MetaMask's unread-notification dot sits on top of the account options button, which is
  // the one dappwright's importPK clicks. Once it reads "9+" it covers the target and
  // Playwright refuses a click it can see something else would receive: thirty seconds of
  // retries and then a timeout inside library code with nothing to do with this app.
  //
  // An init script rather than one addStyleTag, because MetaMask navigates during onboarding
  // and a style attached to the document it had at bootstrap does not survive that.
  //
  // As a source string, not a function: tsx compiles with esbuild, which rewrites named
  // functions to carry a __name() helper that exists in this file's scope and not in the
  // page's, so a function handed to addInitScript throws "__name is not defined" instead of
  // running.
  const HIDE_DOT = ".notifications-tag-counter__unread-dot{display:none !important}";
  await context.addInitScript({
    content: `(function(){var add=function(){var s=document.createElement("style");s.textContent=${JSON.stringify(HIDE_DOT)};document.head.appendChild(s)};if(document.head){add()}else{document.addEventListener("DOMContentLoaded",add)}})()`,
  });
  await page.addStyleTag({ content: HIDE_DOT }).catch(() => {});

  await wallet.importPK(privateKey);
  return { wallet, page, context };
}

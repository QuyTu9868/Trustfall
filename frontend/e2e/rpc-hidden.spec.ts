import { expect, test } from "@playwright/test";

/**
 * The same page, with the tab hidden, which is how a tab spends most of its life.
 *
 * This is the case that actually ran up the bill: a window left open behind another one,
 * reading the contract all night. React Query pauses intervals for a hidden tab by default,
 * and this proves the default is back rather than trusting that it is.
 */
test("a hidden tab stops asking", async ({ page }) => {
  let calls = 0;
  page.on("request", (request) => {
    if (/alchemy|infura|rpc/i.test(request.url())) calls++;
  });

  await page.goto("/rentals", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(8000);

  // Hide it the way a browser does, then stop counting what happened while visible.
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
    Object.defineProperty(document, "hidden", { value: true, configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  const before = calls;
  await page.waitForTimeout(45_000);

  const whileHidden = calls - before;
  console.log(`\n  hidden for 45s: ${whileHidden} rpc calls\n`);
  expect(whileHidden, "a hidden tab is still polling").toBeLessThanOrEqual(2);
});

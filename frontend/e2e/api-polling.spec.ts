import { expect, test } from "@playwright/test";

/**
 * Counts calls to this app's own API while a tab sits hidden.
 *
 * The RPC budget suite watches the browser talking to Alchemy, and misses the larger half:
 * four components polled with a bare setInterval, which nothing pauses, and three of those
 * endpoints read the contract on the server. A hidden tab made no direct RPC call and still
 * cost about 35,000 chain reads a day.
 *
 * So this counts the requests that cause somebody else to spend money on your behalf.
 */
const CHAIN_READING = /\/api\/(messages|disputes|admin)\b/;

test("a hidden tab stops calling the API", async ({ page }) => {
  const calls: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.pathname.startsWith("/api/")) calls.push(url.pathname);
  });

  await page.goto("/rentals", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(8000);

  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
    Object.defineProperty(document, "hidden", { value: true, configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
  });

  const before = calls.length;
  await page.waitForTimeout(45_000);
  const hidden = calls.slice(before);
  const costly = hidden.filter((path) => CHAIN_READING.test(path));

  console.log(`\n  hidden 45s: ${hidden.length} api calls, ${costly.length} of them read the chain`);
  for (const path of [...new Set(hidden)]) {
    console.log(`    ${hidden.filter((p) => p === path).length} x ${path}`);
  }

  expect(costly, `still polling chain-reading endpoints: ${costly.join(", ")}`).toEqual([]);
});

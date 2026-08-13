import { expect, test, type Page } from "@playwright/test";
import { join } from "node:path";

/** Kept next to the suite rather than under the artifacts folder, which Playwright wipes. */
const SHOTS = join(process.cwd(), "e2e", "shots");

/**
 * Every page, opened for real, with the console watched.
 *
 * Nothing here signs anything. That is the point of splitting it out: the pages a stranger
 * can reach without a wallet are the ones a judge opens first, and until now not one line of
 * test had rendered any of them. A build that compiles and a page that works are different
 * claims, and only one of them was ever being checked.
 *
 * Two things are asserted on every page and they are the two that catch real breakage. The
 * page must not be a Next.js error screen, and the browser console must not have logged an
 * error. The second one is what catches a component that threw during render and left a
 * blank area somebody would have to notice by eye.
 */
const PUBLIC_PAGES = [
  { path: "/homepage", name: "homepage", expect: /Trustfall|rent/i },
  { path: "/", name: "index", expect: /./ },
  { path: "/list", name: "list", expect: /./ },
  { path: "/rentals", name: "rentals", expect: /./ },
  { path: "/profile", name: "profile", expect: /./ },
  { path: "/listings/mine", name: "listings-mine", expect: /./ },
  { path: "/admin", name: "admin", expect: /code|sign in|unlock/i },
];

/** Errors the app did not cause and cannot fix, so they are not failures of the app. */
const IGNORED = [
  // Wallet discovery and analytics, both from third party scripts.
  /privy/i,
  /walletconnect/i,
  /Failed to load resource.*fonts/i,
  // React hydration warnings are worth knowing about but are not a broken page, and this
  // suite is about whether the page works at all.
  /Warning:/,
];

function watchConsole(page: Page) {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    const text = message.text();
    if (IGNORED.some((pattern) => pattern.test(text))) return;
    errors.push(text);
  });
  page.on("pageerror", (error) => {
    if (IGNORED.some((pattern) => pattern.test(error.message))) return;
    errors.push(`uncaught: ${error.message}`);
  });
  return errors;
}

for (const target of PUBLIC_PAGES) {
  test(`${target.name} renders`, async ({ page }) => {
    const errors = watchConsole(page);

    const response = await page.goto(target.path, { waitUntil: "domcontentloaded" });
    expect(response?.status(), `${target.path} answered ${response?.status()}`).toBeLessThan(400);

    // Give the client components their first data pass. These pages read a contract and a
    // database before they have anything to show.
    await page.waitForLoadState("networkidle").catch(() => {});

    const body = await page.textContent("body");
    expect(body ?? "", "page came back empty").not.toHaveLength(0);
    // Next's error overlay and its production error page both say this.
    expect(body ?? "").not.toMatch(/Application error: a client-side exception/i);
    expect(body ?? "").toMatch(target.expect);

    // Screenshotted whatever the state, because the skill's point is that looking is the
    // only way to know how a page looks, and an assertion cannot see a broken layout.
    await page.screenshot({
      path: join(SHOTS, `${target.name}.png`),
      fullPage: true,
    });

    expect(errors, `console errors on ${target.path}:\n${errors.join("\n")}`).toEqual([]);
  });
}

/**
 * A listing page with real data in it, which is the state the skill says gets skipped.
 *
 * The id comes from the marketplace page rather than from an API, because there is no GET on
 * /api/listings: the list is read straight from the database in a server component, so the
 * only way to find a real listing is the way a person finds one. That makes this test cover
 * the hop as well as the destination.
 */
test("a listing detail page renders with real data", async ({ page }) => {
  const errors = watchConsole(page);

  await page.goto("/list", { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle").catch(() => {});

  const first = page.locator('a[href^="/listings/"]').first();
  await expect(first, "no listings on the marketplace page").toBeVisible();
  const href = await first.getAttribute("href");

  await page.goto(href!, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle").catch(() => {});

  const text = await page.textContent("body");
  // The numbers are the reason this page exists: rent, deposit, fee and the total.
  expect(text ?? "", "no money shown on a listing page").toMatch(/USDC/);

  await page.screenshot({ path: join(SHOTS, "listing-detail.png"), fullPage: true });
  expect(errors, `console errors:\n${errors.join("\n")}`).toEqual([]);
});

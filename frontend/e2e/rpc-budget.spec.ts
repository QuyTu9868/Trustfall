import { expect, test } from "@playwright/test";

/**
 * Counts how many RPC calls one open page makes, and which methods.
 *
 * Written after a month of Alchemy's free quota went in three days and the guessing started.
 * Reading the polling intervals out of the source gives you an estimate; this gives you the
 * number, broken down by method, which is the only thing that can be compared against a
 * usage graph.
 *
 * Not an assertion about correctness. It is a budget: a page that is doing nothing should
 * cost close to nothing, and any page that does not is the page to go and look at.
 */
const WATCH = /alchemy|infura|rpc/i;
const WINDOW_MS = 45_000;

/** Alchemy's published compute units, for the handful of methods this app can emit. */
const COST: Record<string, number> = {
  eth_call: 26,
  eth_getBlockByNumber: 16,
  eth_blockNumber: 10,
  eth_chainId: 0,
  eth_getBalance: 19,
  eth_getTransactionReceipt: 15,
  eth_estimateGas: 87,
};

for (const path of ["/homepage", "/", "/rentals"]) {
  test(`rpc cost of sitting on ${path}`, async ({ page }) => {
    const methods = new Map<string, number>();

    page.on("request", (request) => {
      if (!WATCH.test(request.url())) return;
      let name = "unknown";
      try {
        const body = request.postDataJSON();
        // Batched calls arrive as an array, and counting the array as one call is exactly
        // the mistake that makes a usage graph surprising.
        const calls = Array.isArray(body) ? body : [body];
        for (const call of calls) {
          name = call?.method ?? "unknown";
          methods.set(name, (methods.get(name) ?? 0) + 1);
        }
        return;
      } catch {
        methods.set(name, (methods.get(name) ?? 0) + 1);
      }
    });

    await page.goto(path, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(WINDOW_MS);

    let total = 0;
    let units = 0;
    const lines: string[] = [];
    for (const [name, count] of [...methods].sort((a, b) => b[1] - a[1])) {
      total += count;
      units += count * (COST[name] ?? 20);
      lines.push(`    ${String(count).padStart(4)} x ${name}`);
    }

    const perDay = Math.round((units / WINDOW_MS) * 86_400_000);
    console.log(
      `\n  ${path}: ${total} calls in ${WINDOW_MS / 1000}s\n${lines.join("\n")}` +
        `\n    = ${units} CU, which is ${(perDay / 1e6).toFixed(1)}M CU a day per open tab\n`
    );

    // A free month is 30M. One idle tab burning a tenth of that a day is a leak, not a
    // usage pattern, so the number is asserted rather than only printed.
    expect(perDay, `${path} costs ${(perDay / 1e6).toFixed(1)}M CU a day`).toBeLessThan(3e6);
  });
}

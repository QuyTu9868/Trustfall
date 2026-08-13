import { defineConfig, devices } from "@playwright/test";

/**
 * Points at whatever is already running, rather than starting anything.
 *
 * BASE_URL is how the same suite covers both: localhost for a build under test, and the
 * deployed URL for checking what strangers actually see. There is no webServer block on
 * purpose, because half the value of this suite is running it against production, and a
 * config that insists on starting its own server cannot do that.
 */
export default defineConfig({
  testDir: "./e2e",
  outputDir: "./e2e/.artifacts",
  // Sepolia and Supabase are both across a network, and a first paint that waits on a
  // contract read is slower than anything local would be.
  timeout: 90_000,
  expect: { timeout: 20_000 },
  // One at a time. These share one deployment and one database, so parallel runs would be
  // reading each other's state and blaming the app for it.
  workers: 1,
  fullyParallel: false,
  reporter: [["list"]],
  use: {
    baseURL: process.env.BASE_URL ?? "https://trustfall-latch.vercel.app",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    ...devices["Desktop Chrome"],
  },
});

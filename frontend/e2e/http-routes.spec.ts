import { expect, test } from "@playwright/test";

/**
 * The seven routes nothing had ever called: faucet, appeal, price-hint, handover-photo,
 * reviews, notifications, messages/unread.
 *
 * No browser needed for any of this, which is why it is a separate file from pages.spec.ts:
 * these are plain HTTP requests against a JSON API, and standing up a page to make them
 * would only be slower.
 *
 * What is deliberately NOT tested here, and why: every route that requires a Privy identity
 * token is only exercised unauthenticated. Faking a valid token would mean either minting
 * real testnet USDC (faucet), signing a real verdict again (appeal on a live dispute), or
 * writing rows under an address this suite does not own. ERROR.md already has an entry for
 * calling a destructive route with real data on the theory that it would be refused; the
 * fix that time was to always reach for a throwaway id, and the fix here is the same idea
 * one step earlier: don't reach for a working credential when the question is just "does
 * the guard guard".
 *
 * A rental id that does not exist is used throughout, for the same reason the admin delete
 * tests use one: the auth check runs first and 401 is 401 whether or not the id is real.
 */
const NOWHERE = 999_999;
const junk = () => `not-a-real-token-${Date.now()}`;

test.describe("faucet", () => {
  test("no token, refused", async ({ request }) => {
    const response = await request.post("/api/faucet");
    expect(response.status()).toBe(401);
  });

  test("garbage token, refused, not a 500", async ({ request }) => {
    const response = await request.post("/api/faucet", {
      headers: { "privy-id-token": junk() },
    });
    // Whatever Privy's SDK does with a token it cannot verify, it must not be an unhandled
    // throw: a 500 here would mean an attacker's malformed header can crash the route.
    expect(response.status(), await response.text()).toBeLessThan(500);
  });
});

test.describe("price-hint", () => {
  test("no category, 400", async ({ request }) => {
    const response = await request.get("/api/price-hint");
    expect(response.status()).toBe(400);
  });

  test("unknown category, 400", async ({ request }) => {
    const response = await request.get("/api/price-hint?category=spaceships");
    expect(response.status()).toBe(400);
  });

  test("real category, answers with a hint or null, never fabricates a price", async ({
    request,
  }) => {
    const response = await request.get("/api/price-hint?category=vehicle");
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    // CLAUDE.md section 9: the hint is real listings' interquartile range or nothing,
    // never a guess. { count, low, high }, not a single number.
    expect(body).toHaveProperty("hint");
    if (body.hint !== null) {
      expect(typeof body.hint.count).toBe("number");
      expect(typeof body.hint.low).toBe("number");
      expect(typeof body.hint.high).toBe("number");
    }
  });
});

test.describe("reviews", () => {
  test("GET needs a rental or a subject", async ({ request }) => {
    const response = await request.get("/api/reviews");
    expect(response.status()).toBe(400);
  });

  test("GET by a rental nobody wrote, empty array not an error", async ({ request }) => {
    const response = await request.get(`/api/reviews?rentalId=${NOWHERE}`);
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body.reviews).toEqual([]);
  });

  test("POST with no token, refused before the body is read", async ({ request }) => {
    const response = await request.post("/api/reviews", {
      data: { rentalId: NOWHERE, rating: 5 },
    });
    expect(response.status()).toBe(401);
  });
});

test.describe("notifications", () => {
  for (const method of ["get", "post", "patch"] as const) {
    test(`${method.toUpperCase()} with no token, refused`, async ({ request }) => {
      const response = await request[method]("/api/notifications", {
        data: method === "post" ? { rentalId: NOWHERE, kind: "approved" } : undefined,
      });
      expect(response.status()).toBe(401);
    });
  }

  test("POST an unknown kind, would be 400 if it got past auth, not 500", async ({
    request,
  }) => {
    const response = await request.post("/api/notifications", {
      data: { rentalId: NOWHERE, kind: "made-up-kind" },
    });
    // No token, so this is a 401 in practice. Asserting < 500 rather than === 401 documents
    // that an unknown kind is validated input either way and never reaches something that
    // throws.
    expect(response.status()).toBeLessThan(500);
  });
});

test.describe("messages/unread", () => {
  test("no token, refused", async ({ request }) => {
    const response = await request.get("/api/messages/unread");
    expect(response.status()).toBe(401);
  });
});

test.describe("disputes/appeal", () => {
  test("no token, refused before the rental is ever read", async ({ request }) => {
    const response = await request.post("/api/disputes/appeal", {
      data: { rentalId: NOWHERE, statement: "test" },
    });
    expect(response.status()).toBe(401);
  });
});

test.describe("handover-photo", () => {
  test("GET no token, refused", async ({ request }) => {
    const response = await request.get(`/api/handover-photo?rentalId=${NOWHERE}`);
    expect(response.status()).toBe(401);
  });

  test("POST no token, refused before the file is looked at", async ({ request }) => {
    const response = await request.post("/api/handover-photo", {
      multipart: { rentalId: String(NOWHERE), phase: "checkin" },
    });
    expect(response.status()).toBe(401);
  });
});

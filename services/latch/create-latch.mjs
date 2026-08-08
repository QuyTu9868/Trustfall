/**
 * Builds the whole latch in one request, instead of by hand in a browser.
 *
 * The dashboard is the documented way and it lost the work twice, because nothing is saved
 * until Activate is pressed and the buttons that invite you to test sit on the same page as
 * the button that saves. Six filters and thirteen rules is too much to retype on a rule you
 * have to remember.
 *
 * So the policy lives here as data. It is reviewable in a diff, it survives a closed tab,
 * and rebuilding is one command rather than an afternoon.
 *
 * The endpoint is not in Latch's public OpenAPI, which only documents the proxy. It came
 * from their own dashboard bundle: POST /admin/latches, same shape the web app sends. Their
 * Terraform provider talks to the same admin API with a ltk_ personal access token, which
 * is what this uses.
 *
 * Usage, from the repo root:
 *   LATCH_ADMIN_TOKEN=ltk_... AGENT_GATEWAY_SECRET=... node services/latch/create-latch.mjs
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));

const token = process.env.LATCH_ADMIN_TOKEN;
const credential = process.env.AGENT_GATEWAY_SECRET;
if (!token || !credential) {
  console.error("Need LATCH_ADMIN_TOKEN (ltk_...) and AGENT_GATEWAY_SECRET in the environment.");
  process.exit(1);
}

// The header the signing routes read. Kept in step with GATEWAY_HEADER in lib/agent-gateway.ts:
// Latch encrypts this on save and never shows it again, so a mismatch is only discoverable
// from the 401 log on our side.
const HEADER = "x-agent-gateway-secret";

/** The money fields an arbitrator has no business naming. See the README for why this is a blocklist. */
const FORBIDDEN = {
  amount: "An arbitrator does not name amounts.",
  to: "An arbitrator does not name addresses.",
  recipient: "An arbitrator does not name addresses.",
  address: "An arbitrator does not name addresses.",
  privateKey: "Nothing here should ever carry a key.",
};

const body = {
  name: "trustfall-agents",
  upstreamBaseUrl: "https://trustfall-latch.vercel.app",
  timeoutMs: 60000,
  // Both on. This is the only record that can show, from outside the app, what the agent
  // asked for and what the policy answered.
  logRequestBody: true,
  logResponseBody: true,
  secret: {
    kind: "new",
    newSecret: {
      name: "trustfall-gateway-secret",
      type: "api_key",
      credential,
      // Not "bearer". The routes read a named header, and picking the wrong one here answers
      // 401 to everything while looking exactly like an outage.
      injectAs: "api_key_header",
      injectKey: HEADER,
    },
  },
  mounts: [],
  // Order matters: first deny wins, so the cheap checks run before the body is modelled.
  pipeline: [
    { type: "method", name: "POST only", allowed: ["POST"] },
    {
      type: "rate_limit",
      name: "Sixty an hour",
      maxRequests: 60,
      windowSeconds: 3600,
      keyBy: "latch",
    },
    {
      type: "endpoint",
      name: "Agent routes only",
      mode: "allowlist",
      patterns: ["/api/agent/**"],
    },
    {
      type: "payload",
      name: "Dispute proposals",
      // The honest use of a when-clause: these rules name fields the other route has not got.
      when: { pathPrefix: "/api/agent/resolve-dispute" },
      rules: [
        { path: "$.rentalId", operator: "exists" },
        {
          path: "$.verdict",
          operator: "in",
          value: ["refund_renter", "split", "pay_owner"],
          reason: "Not a verdict this contract knows.",
        },
        { path: "$.confidence", operator: "type_is", value: "number" },
        { path: "$.confidence", operator: "greater_than_or_equal", value: 0 },
        { path: "$.confidence", operator: "less_than_or_equal", value: 1 },
        { path: "$.reason", operator: "max_length", value: 500 },
        ...Object.entries(FORBIDDEN).map(([path, reason]) => ({
          path: `$.${path}`,
          operator: "not_exists",
          reason,
        })),
      ],
    },
    {
      type: "payload",
      name: "Listing verdicts",
      when: { pathPrefix: "/api/agent/publish-listing" },
      rules: [
        { path: "$.listingId", operator: "exists" },
        {
          path: "$.decision",
          operator: "in",
          value: ["approve", "reject"],
          reason: "A listing check answers approve or reject.",
        },
      ],
    },
    {
      type: "custom_code",
      name: "Verdict authority",
      language: "rust",
      code: readFileSync(join(here, "verdict-authority.rs"), "utf8"),
    },
  ],
};

const response = await fetch("https://onlatch.com/admin/latches", {
  method: "POST",
  headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
  body: JSON.stringify(body),
});

const text = await response.text();
if (!response.ok) {
  console.error(`POST /admin/latches answered ${response.status}`);
  console.error(text.slice(0, 2000));
  process.exit(1);
}

const latch = JSON.parse(text);
console.log(`Created "${latch.name ?? body.name}", id ${latch.id ?? "unknown"}`);
console.log(`Filters: ${latch.pipeline?.length ?? "?"}`);
// The agent's own credential, which is the opposite half of the gateway secret. Printed once
// because this is the only moment it is handed over.
if (latch.accessToken) console.log(`LATCH_API_KEY=${latch.accessToken}`);

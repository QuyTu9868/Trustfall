/**
 * Prints a one-liner to paste into the browser console while logged into onlatch.com.
 *
 * Why this exists rather than the admin API: the /tokens page that mints a ltk_ personal
 * access token is behind a feature flag this account does not have, which the dashboard
 * bundle spells out plainly:
 *
 *     _.to !== "/tokens" || features.terraform && mode === "session"
 *
 * So there is no bearer credential to hold. What there is, is a logged-in session, which is
 * exactly what the dashboard itself uses: fetch("/admin/latches", {credentials:"include"}).
 * Running the same call from the console on the same origin is the same request the Create
 * button makes, with the same body, minus the six forms and the two chances to lose it.
 *
 * The policy still lives in create-latch.mjs. This only re-emits it in a form a browser can
 * run, so there is one definition and not two.
 *
 *   node services/latch/emit-console-snippet.mjs > snippet.txt
 */
import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const credential = process.env.AGENT_GATEWAY_SECRET;
if (!credential) {
  console.error("Set AGENT_GATEWAY_SECRET so the snippet carries the right secret.");
  process.exit(1);
}

// Read the body straight out of the create script by running it with a stubbed fetch, so
// the two can never describe different policies.
let captured = null;
globalThis.fetch = async (_url, options) => {
  captured = JSON.parse(options.body);
  return { ok: true, text: async () => JSON.stringify({ id: "dry-run" }) };
};
process.env.LATCH_ADMIN_TOKEN ||= "not-used-for-the-snippet";
const previousLog = console.log;
console.log = () => {};
// pathToFileURL, not the bare path: on Windows a dynamic import of "d:\..." is rejected as
// an unsupported URL scheme, because "d:" reads as a protocol.
await import(pathToFileURL(join(here, "create-latch.mjs")).href);
console.log = previousLog;

if (!captured) {
  console.error("create-latch.mjs did not produce a body.");
  process.exit(1);
}

const snippet = `await (async () => {
  const r = await fetch("/admin/latches", {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(${JSON.stringify(captured)})
  });
  const t = await r.text();
  if (!r.ok) { console.error("FAILED", r.status, t.slice(0, 800)); return; }
  const l = JSON.parse(t);
  console.log("Created:", l.name, "| id:", l.id, "| filters:", l.pipeline?.length);
  console.log("LATCH_API_KEY=" + (l.accessToken ?? "(open the latch and read it from Connect)"));
})()`;

process.stdout.write(snippet + "\n");

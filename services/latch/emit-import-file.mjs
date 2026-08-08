/**
 * Writes trustfall-agents.latch.json, the file the Import button on the Latches page takes.
 *
 * This is the good path, and it was hiding behind a button in the corner. Import parses the
 * file and calls the same create mutation the form does, then navigates straight to the new
 * latch, so the thing is saved before you can lose it. No Activate step, no unsaved state,
 * no six forms.
 *
 * The shape comes from the dashboard's own import handler, which validates in this order:
 * JSON, single object, non-empty `name`, then reads `upstream.baseUrl`, `pipeline`, and
 * optionally `enabled`, `expiresAt`, `logRequestBody`, `logResponseBody`.
 *
 * Two things import cannot carry, both fixed afterwards in the latch editor:
 *   the secret, which is `secretId` only, so there is no way to create one inline
 *   the timeout, which is not in the mapping at all
 *
 * The pipeline is captured from create-latch.mjs rather than restated, so there is one
 * definition of the policy and it cannot drift between the two files.
 *
 *   node services/latch/emit-import-file.mjs
 */
import { writeFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));

let captured = null;
globalThis.fetch = async (_url, options) => {
  captured = JSON.parse(options.body);
  return { ok: true, text: async () => JSON.stringify({ id: "dry-run" }) };
};

// create-latch.mjs refuses to run without these. The secret never reaches the import file:
// it is attached in the editor afterwards, because the format has no room for one.
process.env.LATCH_ADMIN_TOKEN ||= "not-used-for-the-import-file";
process.env.AGENT_GATEWAY_SECRET ||= "not-used-for-the-import-file";

const previousLog = console.log;
console.log = () => {};
await import(pathToFileURL(join(here, "create-latch.mjs")).href);
console.log = previousLog;

if (!captured) {
  console.error("create-latch.mjs did not produce a body.");
  process.exit(1);
}

const importFile = {
  name: captured.name,
  // Left null on purpose. Attach the secret in the editor after importing, and set INJECT AS
  // to "API key header" with the header name x-agent-gateway-secret, or the signing routes
  // answer 401 to everything.
  secretId: null,
  upstream: { baseUrl: captured.upstreamBaseUrl },
  pipeline: captured.pipeline,
  enabled: true,
  expiresAt: null,
  logRequestBody: true,
  logResponseBody: true,
};

const out = join(here, "trustfall-agents.latch.json");
writeFileSync(out, JSON.stringify(importFile, null, 2) + "\n");

console.log(`Wrote ${out}`);
console.log(`Filters: ${importFile.pipeline.length}`);
for (const [i, f] of importFile.pipeline.entries()) {
  const when = f.when?.pathPrefix ? `  WHEN ${f.when.pathPrefix}` : "";
  const rules = f.rules ? `  ${f.rules.length} rules` : "";
  console.log(`  ${i + 1}. ${f.type}${rules}${when}`);
}
console.log("After importing: open the latch, attach the secret, set the timeout to 60000.");

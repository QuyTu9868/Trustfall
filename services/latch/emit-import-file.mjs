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
 * One catch, and it is fatal if you meet it the way we did. Import carries `secretId` only,
 * never a secret, and the editor labels the field **"fixed after creation"**. A latch
 * imported without a secret id can never be given one: it forwards with nothing attached,
 * every request answers 401, and the only fix is to delete it and start again. timeoutMs is
 * not in the mapping either, and is fixed the same way.
 *
 * So set LATCH_SECRET_ID from a secret made first on the Secrets page. Without it this
 * writes a file that imports cleanly and produces a latch that cannot work, which is worse
 * than one that fails loudly.
 *
 * When there is no secret to point at, use create-latch.mjs or the console snippet instead:
 * POST /admin/latches takes `secret: {kind:"new", newSecret:{...}}` and builds both at once,
 * which is the only path that does everything in a single step.
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

const secretId = process.env.LATCH_SECRET_ID ?? null;
if (!secretId) {
  console.warn(
    "No LATCH_SECRET_ID, so this file will import a latch with no credential.\n" +
      "The secret is fixed at creation, so that latch can never be repaired and every\n" +
      "request through it will 401. Point it at a secret from the Secrets page, or use\n" +
      "the console snippet, which creates the secret and the latch together.\n"
  );
}

const importFile = {
  name: captured.name,
  secretId,
  upstream: { baseUrl: captured.upstream.baseUrl },
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

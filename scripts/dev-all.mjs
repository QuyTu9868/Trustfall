/**
 * One command for the whole local stack: chain, contracts, app.
 *
 * Written by hand rather than with a parallel runner because this is not three things run
 * side by side, it is a sequence. The node has to be answering before the deploy can send
 * anything, and the deploy has to have written deployed.json before Next reads it. A runner
 * that starts all three at once produces a frontend pointing at last week's addresses, which
 * fails later and somewhere else.
 *
 * Ctrl+C stops everything. A stack you have to hunt through Task Manager to kill is how a
 * hardhat node ends up still holding port 8545 an hour later.
 */
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const contracts = join(root, "contracts");
const frontend = join(root, "frontend");

const RPC = "http://127.0.0.1:8545";
const WAIT_MS = 60_000;

const children = [];

/** npm on Windows is a shell script, so it only starts through a shell. */
function run(command, cwd, { inherit = true } = {}) {
  const child = spawn(command, { cwd, shell: true, stdio: inherit ? "inherit" : "pipe" });
  children.push(child);
  return child;
}

function stopAll() {
  for (const child of children) {
    if (child.exitCode === null) child.kill();
  }
}

process.on("SIGINT", () => {
  stopAll();
  process.exit(0);
});
process.on("SIGTERM", () => {
  stopAll();
  process.exit(0);
});

/** One question to the chain: are you there. */
async function pingChain() {
  try {
    const response = await fetch(RPC, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_blockNumber", params: [] }),
    });
    return response.ok;
  } catch {
    return false;
  }
}

/** The same question, repeated, while a node we just started finishes waking up. */
async function waitForChain() {
  const deadline = Date.now() + WAIT_MS;
  while (Date.now() < deadline) {
    if (await pingChain()) return true;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return false;
}

function finished(child, label) {
  return new Promise((resolve, reject) => {
    child.on("exit", (code) =>
      code === 0 ? resolve() : reject(new Error(`${label} exited with ${code}`))
    );
  });
}

async function main() {
  // A node that is already up is left alone, and that is the whole point of asking.
  // Restarting it wipes the chain: rental ids go back to 1 while Supabase still holds rows
  // keyed to the old ones, and every wallet's nonce is suddenly ahead of a chain that has
  // never seen it. Reusing a live node makes running this twice cost nothing.
  const already = await pingChain();

  if (already) {
    console.log("1/3  hardhat node is already running, reusing it");
  } else {
    console.log("1/3  hardhat node");
    const node = run("npm run node", contracts);
    // If the chain dies, nothing downstream can work, so the whole stack goes with it
    // rather than leaving a frontend up that fails on every read.
    node.on("exit", (code) => {
      if (code !== 0) {
        console.error("\nThe chain stopped. Shutting the rest down.");
        stopAll();
        process.exit(1);
      }
    });

    if (!(await waitForChain())) {
      console.error(`No answer from ${RPC} after ${WAIT_MS / 1000}s. Is port 8545 taken?`);
      stopAll();
      process.exit(1);
    }
  }

  // Redeployed either way. It takes seconds, it rewrites the ABI files the frontend
  // imports, and a node that was already up may be running a contract older than the
  // source. Addresses are deterministic, so on a reused node nothing moves.
  console.log("\n2/3  deploy and fund");
  await finished(run("npm run setup:local", contracts), "setup:local");

  // Only when it is true. Printed on every run it became noise, and noise is how the
  // warning that matters gets read past.
  if (!already) {
    console.log(
      "\n     This chain is new, so rental ids start at 1 again. If Supabase still holds\n" +
        "     disputes or messages from a previous run, clear them first:\n" +
        "       npm --prefix frontend run clean:testdata -- --yes"
    );
  }

  console.log("\n3/3  next dev\n");
  run("npm run dev", frontend);
}

main().catch((error) => {
  console.error(error.message);
  stopAll();
  process.exit(1);
});

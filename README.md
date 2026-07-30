# Trustfall

Marketplace for renting real things (homes, vehicles, clothing) with on-chain escrow.
Rent and deposit are held by a smart contract. An AI agent does two jobs: moderating
listings before they go live, and settling disputes at return time. Every agent command
that touches money has to pass through Latch.

Testnet demo, not a commercial product. Currently on Sepolia; the contracts get
rewritten in Rust when Rialo opens its testnet, so they are kept deliberately thin.

## Layout

```
frontend/         Next.js 16 + wagmi + RainbowKit. Also the backend: the API routes
                  that hold the signing key live in frontend/app/api.
contracts/        Solidity. Foundry runs the tests, Hardhat compiles and deploys.
services/         Setup files for third party services, nothing the app imports.
CLAUDE.md         Project rules. Read this first.
UI-REFERENCE.md   Screen layouts and which Airbnb flows to copy.
ERROR.md          Log of coding mistakes, written at each commit.
```

Two things worth knowing about this layout:

**There is no `backend/` folder.** Next.js is full stack, so the server side of Trustfall
is a set of API routes inside `frontend/`, including the ones that hold the signing key.
`contracts/` holds Solidity only.

**`services/` is not where integration code goes.** It holds only what you paste into a
vendor's dashboard, such as `services/supabase/schema.sql`. Privy, Pinata and the rest are
code, and their code lives in `frontend/` because that is its own npm package and Next.js
cannot import from outside it. See `services/README.md`.

## Requirements

- Node.js 20.9 or newer
- [Foundry](https://book.getfoundry.sh/getting-started/installation) for `forge test`
- MetaMask or any browser wallet

## Local setup

The repo uses a git submodule for `forge-std`, so clone with it:

```bash
git clone --recurse-submodules <repo-url>
# already cloned without it:
git submodule update --init --recursive
```

Install dependencies:

```bash
cd contracts && npm install
cd ../frontend && npm install
```

Copy the env templates:

```bash
cp contracts/.env.example contracts/.env
cp frontend/.env.local.example frontend/.env.local
```

In `contracts/.env`, set `DEV_WALLETS` to your own wallet address. That is the only
value local development needs.

## Running

Three terminals.

```bash
# 1. local chain
cd contracts && npm run node

# 2. deploy contracts, then top up the wallets in DEV_WALLETS
cd contracts && npm run setup:local

# 3. frontend
cd frontend && npm run dev
```

Add Localhost 8545 to your wallet (chain id 31337) and open http://localhost:3000.

You do not need to import a test private key. A fresh `hardhat node` knows nothing
about your wallet, so it starts with zero ETH and cannot pay gas. `npm run fund`
sends your address 10 ETH and 10000 test USDC. Every node restart wipes balances,
so run it again after each restart:

```bash
cd contracts && npm run fund
```

## Tests

```bash
cd contracts && npm test          # forge test
cd contracts && npm run compile   # hardhat compile
```

`evmVersion` is pinned to `cancun` in both `hardhat.config.js` and `foundry.toml`.
They have to match, otherwise the bytecode Foundry tests is not the bytecode Hardhat
deploys.

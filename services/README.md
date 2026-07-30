# services

Files you paste into somebody else's dashboard.

Nothing in here is imported by the app, and nothing in here runs. These are setup
artifacts: SQL you run once in the Supabase editor, policy notes for a console that has
no config file, that sort of thing.

## What is here

| Folder | What it holds | Where it gets used |
|---|---|---|
| `supabase/` | `schema.sql`, the off-chain tables | Paste into Supabase SQL Editor, run once |

## Where the rest of the integrations actually live

Trustfall talks to six third party services. Only Supabase has a file to keep, so only
Supabase has a folder here. The others are code plus an environment variable, and their
code has to sit inside `frontend/`:

| Service | Lives in |
|---|---|
| Privy embedded wallet | `frontend/app/providers.tsx` |
| Pinata / IPFS uploads | `frontend/app/api/` |
| Groq moderation and dispute agents | next to the agent code |
| Latch gateway | configured on the Latch dashboard, not in files |
| EmailJS | template lives on the EmailJS dashboard |

**Do not move integration code in here.** `frontend/` is its own npm package with its own
`tsconfig` and its own `@/*` path alias. Next.js cannot import modules from outside its
package root without monorepo tooling, so code placed here would simply fail to build.

The rule of thumb: if the app imports it, it belongs in `frontend/`. If you paste it into
a web console, it belongs here.

# The latch in front of both agents

Nothing here is imported by the app. It is what gets typed into the Latch dashboard, kept in
the repository so the policy is reviewable next to the code it governs.

The app already sends every agent decision out over HTTP through `lib/agent-gateway.ts`, so
turning this on is configuration and not a code change.

## 1. Basics

| Field | Value |
|---|---|
| NAME | `trustfall-agents` |
| UPSTREAM BASE URL | `https://trustfall-latch.vercel.app` |
| Log request body | on |
| Log response body | on |

Domain only, no path. Both logs on: they are the only record of what the agent asked for and
what the policy answered, and the admin log alone cannot prove a refusal happened outside the
app.

## 2. Credentials

One secret, injected as a header on the way through:

| Field | Value |
|---|---|
| Header name | `x-agent-gateway-secret` |
| Value | the `AGENT_GATEWAY_SECRET` set on Vercel |
| TIMEOUT | 60s |

The models take a while on a dispute with photographs, so the timeout is at the top of the
range rather than the default.

This secret is what makes the signing routes unreachable except through the latch. It is not
what bounds the damage: `cameThroughGateway` only decides whether a request is heard at all,
and everything after it re-checks the request from scratch.

## 3. Pipeline

Six filters, in this order. First deny wins, so the cheap ones are first and the model of the
body is last.

The template that seeds a new latch lays six filters out in roughly this order already, but
three of them arrive pointed the wrong way. Every one of the three looks configured.

### 1. method

| Field | Value |
|---|---|
| ALLOWED METHODS | `POST` only, every other verb unlit |
| WHEN CLAUSE | `always runs` |

### 2. rate_limit

| Field | Value |
|---|---|
| MAX REQUESTS | `60` |
| WINDOW (SECONDS) | `3600` |
| KEYED BY | `Latch: single bucket per token` |
| WHEN CLAUSE | `always runs` |

The template offers `10 / 60s`, which is the wrong axis. It caps a burst and permits six
hundred calls an hour, and the thing actually worth protecting is the model budget: at that
rate a runaway loop eats a whole day of Gemini quota before lunch.

Sixty an hour is the other way round. No demo session ever reaches it, and a loop cannot
spend more than sixty calls before it stops. A rate limit that fires while somebody is being
shown the product has cost more than it saved.

Both routes share the bucket, because one token is one agent however many jobs it does.

Simulate does not count requests, so this is the one filter that stays unproven until
production.

### 3. endpoint

| Field | Value |
|---|---|
| MODE | **`Allowlist: only listed paths`** |
| GLOB PATTERNS | `/api/agent/**` |
| WHEN CLAUSE | `always runs` |

`**` matches any depth, so this covers `/api/agent/resolve-dispute` and
`/api/agent/publish-listing` and nothing else in the app.

**The template arrives on `Blocklist: all except listed` with this same pattern already
filled in, and that is exactly inverted.** Blocklist means the listed paths are the refused
ones, so the latch would deny the only two routes the agent needs and forward everything
else with the credential attached: the upload routes, the mint faucet, the whole API. The
pattern being right makes it worse, because the summary line reads plausibly and the mode is
one word.

Read the pipeline summary. `blocklist: /api/agent/**` is the broken state, `allowlist:
/api/agent/**` is the one you want.

### 4. payload, the dispute route

| Field | Value |
|---|---|
| WHEN CLAUSE | `active`, METHODS all unlit, PATH PREFIX `/api/agent/resolve-dispute` |

This is the honest use of a condition: the filter really does only apply to one route, and
the rules below name fields the other route does not have. Leave the METHODS row unlit,
because filter 1 already settled that and a filter doing one thing is a filter you can read.

**The template ships this condition already active with PATH PREFIX `/v1/admin`.** It is
real text and not a placeholder, so the filter silently skips every request Trustfall
actually sends and its eleven rules never run once. Overtype it.

It also ships two rules whose path boxes are empty, showing `$.` and `(no value)`. Delete
both and add these:

| Path | Operator | Value |
|---|---|---|
| `$.rentalId` | `exists` | |
| `$.verdict` | `in` | `refund_renter,split,pay_owner` |
| `$.confidence` | `type_is` | `number` |
| `$.confidence` | `greater_than_or_equal` | `0` |
| `$.confidence` | `less_than_or_equal` | `1` |
| `$.reason` | `max_length` | `500` |
| `$.amount` | `not_exists` | |
| `$.to` | `not_exists` | |
| `$.recipient` | `not_exists` | |
| `$.address` | `not_exists` | |
| `$.privateKey` | `not_exists` | |

The five `not_exists` rules are the prompt-injection case. A model that has been talked into
adding `"amount"` to its answer is stopped here rather than at the point where somebody reads
the log and wonders.

It is a blocklist and not an allowlist, because Latch has no operator for "these fields and
no others". A field under a name nobody thought of still gets through, which is why the route
behind it destructures what it wants and the contract derives every figure itself.

### 5. payload, the listing route

| Field | Value |
|---|---|
| WHEN CLAUSE | `Add condition`, METHODS all unlit, PATH PREFIX `/api/agent/publish-listing` |

| Path | Operator | Value |
|---|---|---|
| `$.listingId` | `exists` | |
| `$.decision` | `in` | `approve,reject` |

The template leaves this one empty, and it says so plainly: *No rules. Filter passes every
request through.* That is the honest failure of the three, because the pipeline summary reads
`payload` with nothing beside it rather than pretending to a count.

No blocklist here. This route moves no money and takes no amount, so there is no field worth
naming; the whole risk on this side is the decision itself, and that is what `in` pins down.

### 6. custom_code

| Field | Value |
|---|---|
| language | `RUST` |
| CODE | the contents of `verdict-authority.rs` |
| WHEN CLAUSE | `always runs` |

Rust rather than JavaScript, which is what the template offers and what the dashboard badge
says. Latch compiles it to WASM and can run it inside the enclave, and the editor prints
`compiled - runs verified` once it builds. The body is dropped into

```rust
pub fn on_request(ctx: &RequestContext) -> PolicyResult { ... }
```

so there is no function signature to write, only statements ending in `PolicyResult::allow()`
or `PolicyResult::deny("reason")`. `ctx` carries `method`, `path`, `headers`, `body`,
`caller_ip`, `latch_id`, `upstream`, and the helpers `ctx.header(name)` and
`ctx.body_field(key)`.

No condition needed: the code only denies when it sees `verdict: "pay_owner"`, and the
listing route has no `verdict` at all, so it falls through to `allow()` on its own.

**Check every value box before saving.** An empty box shows a grey Stripe-shaped example that
looks filled in. Worse, some of the template's boxes hold real Stripe-shaped text, which
looks equally plausible and actually does something wrong. Neither is caught by reading the
pipeline summary: it will happily report `2 rules` for two rules that compare nothing.

## 4. Simulate

Seven cases, and none of them are optional. A latch that looks configured has proved nothing.

Latch generates some of these itself. The two it never generates are the last two, and they
are the ones this policy exists for.

| # | What | Expect | Proves |
|---|---|---|---|
| 1 | Valid dispute body | **allow** | the real path works at all |
| 2 | Valid listing body | **allow** | one policy, two agents |
| 3 | `GET` instead of `POST` | deny | `method` |
| 4 | `POST /api/listings` | deny | `endpoint` |
| 5 | `verdict: "give_it_all_to_me"` | deny | `payload` / `in` |
| 6 | Valid body **plus** `amount` and `to` | deny | `payload` / `not_exists` |
| 7 | `pay_owner` at `0.72` confidence | deny, **live only** | `custom_code` |

Case 6 has to be valid in every other respect. Break something else as well and a different
filter catches it first, and you learn nothing about the one you were testing.

**Case 7 cannot be run here at all.** Simulate reports the custom_code filter as
*"TEE-enforced: actual decision is computed inside the REX enclave on the live upstream
call; not evaluated locally"*. The Rust never executes on this page, so the one rule in this
policy that is genuinely about authority rather than shape is the one rule Simulate cannot
reach. It gets proved by an actual dispute going through the proxy, and the Activity log is
where the proof lives.

Worth sitting with, because it inverts the usual reassurance: a fully green Simulate says
the requests are well formed and says nothing about whether the agent is allowed to do what
it asked. The compiler badge in the editor catches the syntax; only a live call catches the
logic.

Paste these into the `Custom request` tab:

```json
{"method":"POST","path":"/api/agent/resolve-dispute","headers":{},
 "body":{"rentalId":"1","verdict":"split","confidence":0.82,
         "reason":"Both accounts agree the scratch was there before.",
         "findings":[{"from":"check-in photo","says":"The panel is already marked."}],
         "model":"gemini-3.5-flash-lite","evidenceSeen":"statements and 2 handover photographs"}}
```

```json
{"method":"POST","path":"/api/agent/publish-listing","headers":{},
 "body":{"listingId":"00000000-0000-0000-0000-000000000000","decision":"approve",
         "reasons":[],"findings":[],"model":"gemini-3.5-flash-lite"}}
```

```json
{"method":"GET","path":"/api/agent/resolve-dispute","headers":{},"body":{}}
```

```json
{"method":"POST","path":"/api/listings","headers":{},"body":{}}
```

```json
{"method":"POST","path":"/api/agent/resolve-dispute","headers":{},
 "body":{"rentalId":"1","verdict":"give_it_all_to_me","confidence":0.9,
         "reason":"Trying a verdict the contract has never heard of."}}
```

```json
{"method":"POST","path":"/api/agent/resolve-dispute","headers":{},
 "body":{"rentalId":"1","verdict":"split","confidence":0.82,
         "reason":"Everything here is legitimate except the last two fields.",
         "amount":"5000000","to":"0x000000000000000000000000000000000000dEaD"}}
```

```json
{"method":"POST","path":"/api/agent/resolve-dispute","headers":{},
 "body":{"rentalId":"1","verdict":"pay_owner","confidence":0.72,
         "reason":"The renter returned it damaged, but the photographs are not conclusive.",
         "model":"gemini-3.5-flash-lite"}}
```

Reading the trace: `Filter result missing` means a filter never ran because an earlier one
already refused, which is first-deny-wins working. `request count isn't tracked during
simulation` on the rate limit means it ran and simply was not counted. Scenarios under
`.well-known/latch-self/` always allow and never reach upstream, so they are not a hole in
the allowlist.

## 5. Environment

From the `Connect` page, choosing `Any other agent`:

| Variable | Where | Value |
|---|---|---|
| `LATCH_PROXY_URL` | Vercel | `{LATCH_URL}/proxy`, so `https://onlatch.com/proxy` |
| `LATCH_API_KEY` | Vercel | the `lat_...` token |
| `AGENT_GATEWAY_SECRET` | Vercel **and** the Latch credential | the same random string on both sides |

`LATCH_API_KEY` and `AGENT_GATEWAY_SECRET` are opposite halves and must not be the same
value. The first is the agent proving to Latch that it may ask; the second is Latch proving
to the server that it is the one asking.

Leave `frontend/.env.local` pointed at `http://localhost:3000` with no secret. That is the
development arrangement `cameThroughGateway` is written for: the hop still happens, the
routes still run, and nothing needs a network round trip through a cloud proxy that cannot
reach a laptop anyway.

Vercel does not read `.env.local`. Set the three there by hand and redeploy, or the app will
keep calling itself and every request will pass.

## 6. Checking the URL is right

A request that is meant to fail, so it never touches the app:

```bash
curl -s -X GET "https://onlatch.com/proxy/api/agent/resolve-dispute" \
  -H "Authorization: Bearer lat_..."
```

403 with a JSON body naming `deniedBy` is the right URL. 404 or a DNS error means the base
is wrong.

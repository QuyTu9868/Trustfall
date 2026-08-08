import "server-only";

/**
 * The one hop between an agent deciding something and the server acting on it.
 *
 * Until now the two halves called each other as functions in the same process, which meant
 * there was nowhere for a policy gateway to stand. CLAUDE.md section 6 is explicit about
 * the order: the agent proposes over HTTP, something in the middle is allowed to refuse,
 * and only then does the server sign. An agent that signs its own decisions leaves Latch
 * outside the flow with nothing to inspect.
 *
 * So every proposal goes out through here. In development LATCH_PROXY_URL points back at
 * this same app and the hop is a formality; in production it points at Latch, which reads
 * the request, checks it against a policy, and either forwards it with a credential
 * attached or answers 403. The agent code is identical either way, which is the point:
 * "the well-behaved agent never knows Latch exists".
 */
export class Blocked extends Error {
  constructor(
    readonly reason: string,
    /** Which filter said no, when the gateway names one. Empty for a plain refusal. */
    readonly deniedBy: string
  ) {
    super(reason);
  }
}

export class GatewayUnreachable extends Error {}

/**
 * Sends a proposal and returns whatever the server answered.
 *
 * A refusal is not an error to be worked around. It throws Blocked, the caller records it,
 * and nothing retries: retrying past a policy is the one behaviour that would make the
 * policy pointless, and a gateway that can be worn down by repetition is decoration.
 */
export async function propose<T>(path: string, body: unknown): Promise<T> {
  const base = process.env.LATCH_PROXY_URL;
  if (!base) {
    throw new GatewayUnreachable(
      "No LATCH_PROXY_URL, so there is nowhere to send this. Set it in frontend/.env.local."
    );
  }

  let response: Response;
  try {
    response = await fetch(`${base.replace(/\/$/, "")}${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        // Only when the gateway hands one out. Latch attaches its own credential on the
        // way through, so this is the direct-call case and is absent in production.
        ...(process.env.LATCH_API_KEY
          ? { authorization: `Bearer ${process.env.LATCH_API_KEY}` }
          : {}),
      },
      body: JSON.stringify(body),
    });
  } catch (error) {
    throw new GatewayUnreachable(
      `Could not reach the gateway: ${error instanceof Error ? error.message : "unknown"}`
    );
  }

  if (response.status === 403) {
    // Latch answers with a body naming the filter that refused. Kept whole and written
    // down rather than summarised, because "blocked" without a reason is a dead end for
    // whoever has to work out why a deposit did not move.
    const detail = await response.json().catch(() => ({}) as Record<string, string>);
    throw new Blocked(
      detail.reason ?? "The gateway refused this request.",
      detail.deniedBy ?? ""
    );
  }

  const result = await response.json().catch(() => ({}) as Record<string, unknown>);
  if (!response.ok) {
    throw new GatewayUnreachable(
      typeof result.error === "string" ? result.error : `The server answered ${response.status}.`
    );
  }
  return result as T;
}

/**
 * Whether a request arriving at a signing route came through the gateway.
 *
 * Two states on purpose. With no secret set this is the development arrangement, where
 * LATCH_PROXY_URL points at this app and the hop is a formality: the check passes and says
 * so. Set the secret in both Latch and here and it starts being enforced, which is the
 * moment the split becomes real. No code changes between those two, only configuration.
 *
 * The secret is what stops somebody curling the signing route directly. It is not what
 * bounds the damage: the routes re-read the chain, re-check the confidence bar, and the
 * contract accepts one of three words and derives every amount itself.
 */
export const GATEWAY_HEADER = "x-agent-gateway-secret";

export function cameThroughGateway(request: Request) {
  const expected = process.env.AGENT_GATEWAY_SECRET;
  if (!expected) return { ok: true, guarded: false };

  const sent = request.headers.get(GATEWAY_HEADER);
  if (sent === expected) return { ok: true, guarded: true };

  // Named, because the one thing that cannot be checked afterwards is the name.
  //
  // Latch encrypts a credential on save and never shows it again, including which header it
  // attaches it to. Pick the wrong one in its INJECT AS box and every request answers 401,
  // which reads as a broken gateway or a mistyped secret rather than a credential arriving
  // safely under a name nobody is reading.
  //
  // So the first refusal says what did arrive. Names only: a value here would put the
  // credential in a log, and the whole point of the header is that it stays out of them.
  console.error(
    `[gateway] 401 on ${new URL(request.url).pathname}. Expected the secret in "${GATEWAY_HEADER}"` +
      `${sent === null ? ", which was absent" : ", which was present but did not match"}.` +
      ` Headers received: ${[...request.headers.keys()].sort().join(", ")}`
  );

  return { ok: false, guarded: true };
}

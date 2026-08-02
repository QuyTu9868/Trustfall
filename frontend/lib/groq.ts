import "server-only";

/**
 * One way in to the model, for both agents.
 *
 * The listing checker and the dispute arbitrator ask different questions but hit exactly
 * the same walls, and every one of those walls cost a measurement to find. Two copies of
 * this would drift, and the copy that drifted would be the one nobody was watching.
 */
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

/** Production on Groq, and the only one there that can see an image. */
export const MODEL = "qwen/qwen3.6-27b";

export class GroqUnavailable extends Error {}

/**
 * Squeezed between two failures, both met the hard way.
 *
 * Too high and the request is refused before it runs: the reservation counts against the
 * per minute allowance whether it is spent or not, and Groq sizes photographs generously
 * when it checks. Against a limit of 8000, asking for 4096 made the request 9048, 3584
 * made it 8535, and 3000 made it 8143. None of those could ever succeed.
 *
 * Too low and the model spends the whole budget thinking, returns nothing at all, and the
 * request comes back with an error about JSON validation. 2048 was enough for blank test
 * images and not for real photographs.
 */
const MAX_COMPLETION_TOKENS = 2816;

/**
 * Waiting out a busy minute rather than failing. Capped, because taking Groq's own
 * retry-after entirely on trust once left a request open for a quarter of an hour behind
 * a spinner with nothing to explain it.
 */
const RETRY_DELAYS_MS = [12_000, 25_000, 40_000];
const MAX_WAIT_MS = 45_000;

class RateLimited extends Error {
  constructor(readonly retryAfterMs: number | null) {
    super("rate limited");
  }
}

/**
 * Asks the model, and returns whatever it said.
 *
 * Reading the answer is the caller's job, because the two agents want different shapes out
 * and disagree about what an unreadable answer means. For the listing checker it means
 * reject; for the arbitrator there is no safe default, since all three outcomes move money.
 */
export async function askGroq(input: {
  system: string;
  text: string;
  images: string[];
}): Promise<string> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await once(input);
    } catch (error) {
      if (!(error instanceof RateLimited)) throw error;
      if (attempt >= RETRY_DELAYS_MS.length) {
        throw new GroqUnavailable("The model is busy. Wait a minute and try again.");
      }
      const suggested = error.retryAfterMs ?? RETRY_DELAYS_MS[attempt];
      await new Promise((resolve) => setTimeout(resolve, Math.min(suggested, MAX_WAIT_MS)));
    }
  }
}

async function once(input: { system: string; text: string; images: string[] }) {
  const key = process.env.GROQ_API_KEY;
  if (!key) {
    throw new GroqUnavailable(
      "No GROQ_API_KEY in frontend/.env.local, so nothing can be checked or judged."
    );
  }

  let response: Response;
  try {
    response = await fetch(GROQ_URL, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: MODEL,
        // Zero. The same evidence asked twice has to get the same answer, or nobody can
        // tell whether a verdict came from the facts or from the sampling.
        temperature: 0,
        response_format: { type: "json_object" },
        max_completion_tokens: MAX_COMPLETION_TOKENS,
        // Keeps the reasoning out of the reply. Measured: it saves no tokens, because the
        // model still does the thinking. Callers cope with it being there anyway, because
        // a provider that stops honouring this must not change any decision.
        //
        // reasoning_effort stays at its default. Turning it off is ten times cheaper and
        // seven times faster, and it got a plainly clean listing wrong.
        reasoning_format: "hidden",
        messages: [
          { role: "system", content: input.system },
          {
            role: "user",
            content: [
              { type: "text", text: input.text },
              ...input.images.map((url) => ({ type: "image_url", image_url: { url } })),
            ],
          },
        ],
      }),
    });
  } catch {
    throw new GroqUnavailable("Could not reach the model. Try again in a moment.");
  }

  // Groq's own trouble, not the caller's. Waits alongside the rate limit.
  if (response.status === 503) throw new RateLimited(null);

  if (response.status === 429) {
    const body = await response.text();
    // Two different things share this status. Out of tokens for the minute clears by
    // itself; a single request larger than the whole minute's allowance never does, and
    // retrying it only wastes the caller's time before failing anyway.
    if (body.includes("Request too large")) {
      throw new GroqUnavailable(
        "This request is too large for the current plan. Use fewer or smaller photos."
      );
    }
    const header = response.headers.get("retry-after");
    const seconds = header ? Number(header) : NaN;
    throw new RateLimited(Number.isFinite(seconds) ? seconds * 1000 : null);
  }

  if (!response.ok) {
    const detail = await response.text();
    // The model ran out of room and said nothing. Worth its own sentence: the raw error
    // names JSON validation, which sends whoever reads it hunting for a format bug.
    if (detail.includes("json_validate_failed")) {
      throw new GroqUnavailable(
        "The model ran out of room before it answered. Shorten the text and try again."
      );
    }
    throw new GroqUnavailable(`The model refused the request: ${detail.slice(0, 200)}`);
  }

  const result = await response.json();
  return (result.choices?.[0]?.message?.content ?? "") as string;
}

/** Files as data URLs, which is how both Groq and the browser want to see an image. */
export async function toDataUrls(files: File[]) {
  return Promise.all(
    files.map(async (file) => {
      const base64 = Buffer.from(await file.arrayBuffer()).toString("base64");
      return `data:${file.type};base64,${base64}`;
    })
  );
}

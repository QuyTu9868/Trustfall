import "server-only";

/**
 * One way in to the model, for both agents.
 *
 * The listing checker and the dispute arbitrator ask different questions but hit exactly
 * the same walls, and every one of those walls cost a measurement to find. Two copies of
 * this would drift, and the copy that drifted would be the one nobody was watching.
 *
 * Named for what it does rather than for who supplies it. The file this replaced was
 * called groq.ts, and renaming seven imports was the smaller half of that mistake: the
 * larger half was a constant called MAX_COMPLETION_TOKENS whose value only made sense
 * under one provider's billing.
 */
const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";

/**
 * Two models, chosen by how often each job runs rather than by how hard it is.
 *
 * Google's free tier caps requests per day per model, and the numbers are not close: every
 * model on the account allows 20 a day except flash-lite, which allows 500. Measured on
 * 2026-08-03 from the account's own rate limit page, after a single test run exhausted a
 * day of the good model in one sitting.
 *
 * So the split follows the traffic. Checking a listing happens on every publish, which is
 * tens of calls while seeding demo data, and it goes where the allowance is. Judging a
 * dispute happens a handful of times ever, so it gets the stronger model and its own
 * separate 20 a day, which the listing checks can no longer eat into.
 *
 * Both are generally available. CLAUDE.md section 6 rules out anything named preview, and
 * both names came from the model list Google returned rather than from memory.
 */
export const MODERATION_MODEL = "gemini-3.5-flash-lite";
export const ARBITRATION_MODEL = "gemini-3.6-flash";

// Requests a minute, from the same page: 15 for flash-lite, 5 for the arbitration model.
// Not a constant here because nothing in the app paces itself; the retry above handles a
// busy minute, and only the test suites space their calls out deliberately.

export class ModelUnavailable extends Error {}

/**
 * Room for the reply, and no longer a tightrope.
 *
 * Under Groq this number was squeezed between two failures: too high and the reservation
 * alone blew the per minute allowance before the request ran, too low and the model spent
 * the budget thinking and returned nothing. Gemini charges what is actually spent, so this
 * is only a ceiling against a runaway answer. Measured: a real dispute with two photographs
 * costs about 2450 tokens all in, against an allowance in the hundreds of thousands.
 */
const MAX_OUTPUT_TOKENS = 8192;

/** Waiting out a busy minute rather than failing, with a cap so nothing hangs on a spinner. */
const RETRY_DELAYS_MS = [8_000, 20_000, 35_000];
const MAX_WAIT_MS = 45_000;

class RateLimited extends Error {
  constructor(readonly retryAfterMs: number | null) {
    super("rate limited");
  }
}

export type Ask = {
  system: string;
  text: string;
  images: string[];
  /** Which of the two, and therefore which daily allowance this spends. */
  model: string;
};

/**
 * Asks the model, and returns whatever it said.
 *
 * Reading the answer is the caller's job, because the two agents want different shapes out
 * and disagree about what an unreadable answer means. For the listing checker it means
 * reject; for the arbitrator there is no safe default, since all three outcomes move money.
 */
export async function askModel(input: Ask): Promise<string> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await once(input);
    } catch (error) {
      if (!(error instanceof RateLimited)) throw error;
      if (attempt >= RETRY_DELAYS_MS.length) {
        throw new ModelUnavailable("The model is busy. Wait a minute and try again.");
      }
      const suggested = error.retryAfterMs ?? RETRY_DELAYS_MS[attempt];
      await new Promise((resolve) => setTimeout(resolve, Math.min(suggested, MAX_WAIT_MS)));
    }
  }
}

async function once(input: Ask) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    throw new ModelUnavailable(
      "No GEMINI_API_KEY in frontend/.env.local, so nothing can be checked or judged."
    );
  }

  let response: Response;
  try {
    response = await fetch(`${ENDPOINT}/${input.model}:generateContent`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: input.system }] },
        contents: [
          {
            role: "user",
            parts: [{ text: input.text }, ...input.images.map(toInlineData)],
          },
        ],
        generationConfig: {
          // Zero. The same evidence asked twice has to get the same answer, or nobody can
          // tell whether a verdict came from the facts or from the sampling.
          temperature: 0,
          // Asks for JSON and gets JSON: no prose around it, no markdown fence, no block of
          // reasoning with draft verdicts inside it. The callers still parse defensively,
          // because a provider that stops honouring this must not change any decision.
          responseMimeType: "application/json",
          maxOutputTokens: MAX_OUTPUT_TOKENS,
        },
      }),
    });
  } catch {
    throw new ModelUnavailable("Could not reach the model. Try again in a moment.");
  }

  // Google's own trouble, not the caller's. Waits alongside the rate limit.
  if (response.status === 503) throw new RateLimited(null);

  if (response.status === 429) {
    throw new RateLimited(retryAfterMs(await response.text()));
  }

  if (!response.ok) {
    const detail = await response.text();
    throw new ModelUnavailable(`The model refused the request: ${detail.slice(0, 200)}`);
  }

  const result = await response.json();
  const candidate = result.candidates?.[0];

  // Stopping for any reason other than finishing means the text below is a fragment, and a
  // fragment parses as an unreadable answer rather than as the failure it is. Saying which
  // failure saves the next person hunting for a parsing bug that is not there.
  if (candidate?.finishReason && candidate.finishReason !== "STOP") {
    throw new ModelUnavailable(
      candidate.finishReason === "MAX_TOKENS"
        ? "The model ran out of room before it answered. Shorten the text and try again."
        : `The model stopped early: ${candidate.finishReason}.`
    );
  }

  return (candidate?.content?.parts ?? [])
    .map((part: { text?: string }) => part.text ?? "")
    .join("");
}

/** A data URL as Gemini wants it: the media type and the base64 payload, separately. */
function toInlineData(dataUrl: string) {
  const match = /^data:([^;]+);base64,(.*)$/s.exec(dataUrl);
  if (!match) throw new ModelUnavailable("An image was not a base64 data URL.");
  return { inlineData: { mimeType: match[1], data: match[2] } };
}

/**
 * How long to wait, when Google says.
 *
 * The delay arrives inside the error body as a RetryInfo detail rather than in a header,
 * so it has to be dug out of the JSON. Anything unreadable falls back to our own schedule.
 */
function retryAfterMs(body: string): number | null {
  const match = /"retryDelay"\s*:\s*"(\d+(?:\.\d+)?)s"/.exec(body);
  return match ? Math.round(Number(match[1]) * 1000) : null;
}

/** Files as data URLs, which is how both the model and the browser want to see an image. */
export async function toDataUrls(files: File[]) {
  return Promise.all(
    files.map(async (file) => {
      const base64 = Buffer.from(await file.arrayBuffer()).toString("base64");
      return `data:${file.type};base64,${base64}`;
    })
  );
}

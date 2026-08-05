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
 * One model for both agents, and it is the one with an allowance rather than the clever one.
 *
 * Google's free tier caps requests per day per model, and the numbers are not close: every
 * model on this account allows 20 a day except flash-lite, which allows 500. Read from the
 * account's own rate limit page on 2026-08-04.
 *
 * The first arrangement here gave the arbitrator the stronger model, on the grounds that
 * disputes are rare and deserve the better judgement. Twenty a day did not survive contact:
 * seeding three demo disputes exhausted it, twice, and a model that cannot be called is
 * not a better model. Flash-lite scored 37 out of 37 on the listing suite including the
 * cases with photographs, so the loss is smaller than the constraint.
 *
 * Switching the arbitrator back for a live demo is one line, and worth doing on the day.
 *
 * Generally available, not preview, which CLAUDE.md section 6 requires. The name came from
 * the model list Google returned rather than from memory.
 */
export const MODERATION_MODEL = "gemini-3.5-flash-lite";
export const ARBITRATION_MODEL = "gemini-3.5-flash-lite";

/**
 * Where to go when the model above is not answering at all.
 *
 * Only for 503, which is Google saying the model is overloaded worldwide. That is a
 * different thing from 429, and the difference decides whether falling back is sensible: a
 * per minute limit clears on its own, a daily limit does not clear at all, and neither is
 * helped by asking a different model. An overloaded model might never come back today, and
 * during a demo that is the whole product down.
 *
 * Deliberately a model with a small daily allowance. It is only reached when the primary is
 * unreachable, so twenty a day is plenty, and picking the stronger one means the fallback is
 * a better answer rather than a worse one.
 */
const FALLBACK_MODEL = "gemini-3.6-flash";

// Fifteen requests a minute alongside the 500 a day, from the same page. Not a constant
// because nothing in the app paces itself: the retry below rides out a busy minute, and
// only the test suites space their calls deliberately.

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

/**
 * Waiting out a busy minute rather than failing, with a cap so nothing hangs on a spinner.
 *
 * The first delay is thirteen seconds and not eight for a reason worth writing down: a
 * retry is itself a request and counts against the same allowance, so retrying faster than
 * the limit allows spends the very thing it is waiting for.
 */
const RETRY_DELAYS_MS = [13_000, 25_000, 40_000];
const MAX_WAIT_MS = 45_000;

class RateLimited extends Error {
  constructor(
    readonly retryAfterMs: number | null,
    /** True for 503, meaning the model is overloaded rather than this account being over
     *  its allowance. Only the first is worth asking a different model about. */
    readonly overloaded = false
  ) {
    super("rate limited");
  }
}

/** The answer, and which model actually produced it, which is not always the one asked. */
export type Answer = { text: string; model: string };

export type Ask = {
  system: string;
  text: string;
  images: string[];
  /** Named per call rather than read from a constant, so a demo can point one agent
   * somewhere else for an afternoon without touching the other. */
  model: string;
};

/**
 * Asks the model, and returns whatever it said.
 *
 * Reading the answer is the caller's job, because the two agents want different shapes out
 * and disagree about what an unreadable answer means. For the listing checker it means
 * reject; for the arbitrator there is no safe default, since all three outcomes move money.
 */
export async function askModel(input: Ask): Promise<Answer> {
  let overloaded = false;

  for (let attempt = 0; ; attempt++) {
    try {
      return { text: await once(input, input.model), model: input.model };
    } catch (error) {
      if (!(error instanceof RateLimited)) throw error;
      overloaded = overloaded || error.overloaded;

      if (attempt >= RETRY_DELAYS_MS.length) break;
      const suggested = error.retryAfterMs ?? RETRY_DELAYS_MS[attempt];
      await new Promise((resolve) => setTimeout(resolve, Math.min(suggested, MAX_WAIT_MS)));
    }
  }

  // Out of patience. Which model to blame depends on why: an overloaded model is Google's
  // problem and another one may well answer, while a rate limit is this account's problem
  // and every model shares the account. Trying the fallback on a rate limit would spend a
  // second allowance to be told the same thing.
  if (!overloaded || input.model === FALLBACK_MODEL) {
    throw new ModelUnavailable("The model is busy. Wait a minute and try again.");
  }

  try {
    return { text: await once(input, FALLBACK_MODEL), model: FALLBACK_MODEL };
  } catch {
    throw new ModelUnavailable(
      `Both ${input.model} and ${FALLBACK_MODEL} are unavailable right now. This is Google's end, not yours.`
    );
  }
}

async function once(input: Ask, model: string) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    throw new ModelUnavailable(
      "No GEMINI_API_KEY in frontend/.env.local, so nothing can be checked or judged."
    );
  }

  let response: Response;
  try {
    response = await fetch(`${ENDPOINT}/${model}:generateContent`, {
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
  if (response.status === 503) throw new RateLimited(null, true);

  if (response.status === 429) {
    const body = await response.text();
    // Two different things share this status, and treating them alike is expensive. Out of
    // requests for the minute clears by itself. Out of requests for the day does not, and
    // every retry against it is another request off tomorrow's allowance: four attempts
    // spend a fifth of a day's twenty to learn something the first reply already said.
    if (/PerDay/i.test(body)) {
      throw new ModelUnavailable(
        `Today's allowance for ${model} is used up. It resets at midnight Pacific.`
      );
    }
    throw new RateLimited(retryAfterMs(body));
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

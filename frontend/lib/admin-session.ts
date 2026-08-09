import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { verifyCode } from "./totp";

/**
 * Proof that somebody typed a valid code recently, in a cookie they cannot forge.
 *
 * The cookie carries an expiry and a signature over it. Nothing else: there is one admin,
 * so there is nothing to identify. Signed with the same secret the codes come from, which
 * means losing that secret loses both, and losing it already means somebody can generate
 * codes anyway.
 */
const COOKIE = "trustfall-admin";
const HOURS = 2;

function secret() {
  const value = process.env.ADMIN_TOTP_SECRET;
  if (!value) throw new Error("No ADMIN_TOTP_SECRET in frontend/.env.local.");
  return value;
}

function sign(expiry: number) {
  return createHmac("sha256", secret()).update(String(expiry)).digest("hex");
}

export async function startAdminSession() {
  const expiry = Date.now() + HOURS * 60 * 60 * 1000;
  const jar = await cookies();
  jar.set(COOKIE, `${expiry}.${sign(expiry)}`, {
    // Not readable from JavaScript, not sent to other sites, and gone when the expiry
    // passes. The page it protects is a log of decisions about other people's money.
    httpOnly: true,
    sameSite: "strict",
    path: "/",
    maxAge: HOURS * 60 * 60,
  });
}

/**
 * Signs out this browser, and only this browser.
 *
 * Worth being precise about, because the name promises more than it delivers. The cookie
 * validates itself: an expiry and a signature over it, with nothing recorded server side. So
 * deleting it tells this browser to forget it and does nothing at all about a copy somebody
 * already has, which stays good until the expiry passes.
 *
 * Revoking it properly needs somewhere to write "sessions issued before now are void", and
 * on serverless that has to be the database rather than memory, because each instance has
 * its own. That is a table and a migration to protect one admin on a testnet demo.
 *
 * The cheaper answer is to stop the cookie being worth stealing: requireFreshCode below
 * makes every destructive route ask for a code that is valid at that moment, so a leaked
 * session can read the log and cannot change it. The window it can read for is two hours.
 */
export async function endAdminSession() {
  (await cookies()).delete(COOKIE);
}

export async function hasAdminSession() {
  const value = (await cookies()).get(COOKIE)?.value;
  if (!value) return false;

  const [expiry, signature] = value.split(".");
  const expiresAt = Number(expiry);
  if (!Number.isFinite(expiresAt) || Date.now() > expiresAt) return false;

  try {
    const expected = Buffer.from(sign(expiresAt));
    const actual = Buffer.from(signature ?? "");
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

/**
 * A second gate, for the routes that can destroy something.
 *
 * Reading the log and emptying it are different powers and this stops them travelling on the
 * same ticket. A session says somebody typed a code within the last two hours. This says
 * somebody has the authenticator in their hand right now, which is the thing a stolen cookie
 * cannot supply.
 *
 * It also happens to close the sign-out hole where it matters: a copy of the cookie survives
 * a sign-out, and now the worst it can do is read.
 */
export function freshCodeIsWrong(code: unknown): string | null {
  const value = String(code ?? "").trim();
  if (!value) return "This needs a code from your authenticator.";
  if (!verifyCode(secret(), value)) return "That code is not valid.";
  return null;
}

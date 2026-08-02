import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

/**
 * Proof that somebody typed a valid code recently, in a cookie they cannot forge.
 *
 * The cookie carries an expiry and a signature over it. Nothing else: there is one admin,
 * so there is nothing to identify. Signed with the same secret the codes come from, which
 * means losing that secret loses both, and losing it already means somebody can generate
 * codes anyway.
 */
const COOKIE = "trustfall-admin";
const HOURS = 8;

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

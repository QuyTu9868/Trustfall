import "server-only";
import { PrivyClient } from "@privy-io/server-auth";
import { cookies } from "next/headers";

/**
 * Works out who is calling, on the server, from Privy's identity token.
 *
 * The point of this file: an API route must never take the wallet address the browser
 * sends it. Anyone can post any address and publish a listing under someone else's name.
 * getUser({idToken}) verifies the token signature first, then reads the wallet out of the
 * verified payload, so the address comes from Privy rather than from the caller.
 */
const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
const appSecret = process.env.PRIVY_APP_SECRET;

const ID_TOKEN_COOKIE = "privy-id-token";

export class AuthError extends Error {}

/**
 * Cookie first, header second.
 *
 * Privy attaches privy-id-token to every same origin request by itself, so the cookie is
 * always there and never depends on a React hook having finished loading. Once a base
 * domain is configured for the deployed app the cookie becomes HttpOnly, at which point
 * JavaScript cannot read it at all and the header route stops working entirely. Reading
 * the cookie is therefore the path that survives going to production.
 *
 * The header stays as a fallback for the case where a browser refuses the cookie.
 */
export async function readIdentityToken(request: Request) {
  const jar = await cookies();
  return jar.get(ID_TOKEN_COOKIE)?.value ?? request.headers.get(ID_TOKEN_COOKIE);
}

export async function walletFromIdentityToken(idToken: string | null) {
  if (!appId || !appSecret) {
    throw new Error(
      "Privy is not configured. Set NEXT_PUBLIC_PRIVY_APP_ID and PRIVY_APP_SECRET in frontend/.env.local"
    );
  }
  // Two causes look identical from here: nobody is signed in, or identity tokens are
  // switched off in the Privy dashboard. Naming both beats guessing one and sending
  // somebody off to fix the wrong thing.
  if (!idToken) {
    throw new AuthError(
      "No session token. Sign out and sign in again. If that does not help, turn on " +
        '"Return user data in an identity token" in the Privy dashboard.'
    );
  }

  const privy = new PrivyClient(appId, appSecret);

  let user;
  try {
    user = await privy.getUser({ idToken });
  } catch {
    throw new AuthError("Your sign in has expired. Sign in again.");
  }

  // Privy warns the identity token payload can be trimmed for size, so a missing wallet
  // is a real possibility rather than an impossible branch.
  const address = user.wallet?.address;
  if (!address) throw new AuthError("No wallet on this account yet.");

  // The database stores addresses lowercase: the wallet_address domain in schema.sql
  // rejects anything else, which stops the same wallet existing twice in two casings.
  return address.toLowerCase();
}

import { NextResponse } from "next/server";

/**
 * Turns anything thrown inside a route handler into a JSON body with a readable message.
 *
 * Without this, a thrown error leaves Next to answer with a bare 500 and an empty body,
 * which tells whoever is debugging precisely nothing. A missing environment variable and
 * a dead database then look identical from the outside.
 */
export function errorResponse(error: unknown, status = 500) {
  const message = error instanceof Error ? error.message : "Something went wrong.";
  return NextResponse.json({ error: message }, { status });
}

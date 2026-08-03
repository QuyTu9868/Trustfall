"use client";

import { usePrivy } from "@privy-io/react-auth";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * The app is for people who are signed in. Everybody else gets the landing page.
 *
 * The gate is here rather than in middleware because the answer to "is this person signed
 * in" lives in the Privy SDK in the browser, not in a cookie the server can read. A
 * middleware redirect would have to guess, and guessing wrong either locks out somebody
 * who is signed in or shows the app to somebody who is not.
 *
 * Children are rendered on the server and passed in, so the listing grid is already built
 * by the time this decides. That costs one wasted render for a signed out visitor and buys
 * a signed in one their page with no second round trip.
 */
export function SignedInOnly({ children }: { children: React.ReactNode }) {
  const { ready, authenticated } = usePrivy();
  const router = useRouter();

  useEffect(() => {
    // Waiting for ready matters. Privy reports authenticated as false while it is still
    // starting up, and acting on that would bounce every returning visitor to the landing
    // page for a moment before letting them back in.
    if (ready && !authenticated) router.replace("/homepage");
  }, [ready, authenticated, router]);

  if (!ready || !authenticated) {
    // Holds the height so the header does not jump, and says nothing: this state lasts a
    // few hundred milliseconds and a message would only flash.
    return <div className="min-h-[60vh]" aria-hidden />;
  }

  return <>{children}</>;
}

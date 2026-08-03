"use client";

import { usePrivy } from "@privy-io/react-auth";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * The one button on the landing page, and the other half of the rule the app runs on:
 * signed out people see this page, signed in people see the app.
 *
 * Signing in is also how somebody without a wallet gets one. Privy makes an embedded
 * wallet from an email address, so the honest label is about signing in rather than about
 * connecting a wallet, which would turn away everybody who does not have one yet.
 */
export function LandingCta({ label = "Sign in and open the app" }: { label?: string }) {
  const { ready, authenticated, login } = usePrivy();
  const router = useRouter();

  useEffect(() => {
    if (ready && authenticated) router.replace("/");
  }, [ready, authenticated, router]);

  return (
    <button
      onClick={login}
      disabled={!ready}
      className="rounded-control bg-ink-strong px-6 py-3 text-base text-canvas transition-transform active:scale-[0.98] disabled:opacity-40"
    >
      {ready ? label : "Loading..."}
    </button>
  );
}

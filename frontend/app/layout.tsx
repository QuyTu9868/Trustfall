import type { Metadata } from "next";
import { Geist, Geist_Mono, Instrument_Serif } from "next/font/google";
import "./globals.css";
import { IdentityGuard } from "@/components/identity-guard";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { Providers } from "./providers";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// One weight, headings only. Carries the editorial contrast against the sans body.
const instrumentSerif = Instrument_Serif({
  variable: "--font-instrument-serif",
  subsets: ["latin"],
  weight: "400",
});

export const metadata: Metadata = {
  title: "Trustfall",
  description: "Rent real things with on-chain escrow",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${instrumentSerif.variable} h-full`}
      // The Privy SDK writes scroll-behavior onto <html> when it initialises, which the
      // server never rendered, so React reports a hydration mismatch. Suppressed on this
      // one element only: a genuine mismatch deeper in the tree still warns, and a dev
      // console full of noise is a console where the real warning gets missed.
      suppressHydrationWarning
    >
      <body className="flex min-h-full flex-col">
        <Providers>
          <SiteHeader />
          <div className="mx-auto w-full max-w-6xl flex-1 px-6 py-10">
            {/* Wraps the page, not the header. The header stays visible so the address on
                screen is right there next to the warning explaining it. */}
            <IdentityGuard>{children}</IdentityGuard>
          </div>
          <SiteFooter />
        </Providers>
      </body>
    </html>
  );
}

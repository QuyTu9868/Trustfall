import type { Metadata } from "next";
import { Geist, Geist_Mono, Instrument_Serif } from "next/font/google";
import "./globals.css";
import { IdentityGuard } from "@/components/identity-guard";
import { Chrome } from "@/components/site-chrome";
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
      <head>
        {/*
          Runs before the first paint, which is the only way to avoid a white flash on the
          way into a dark page. A React effect is too late: by the time it runs the browser
          has already drawn the light theme and the correction reads as a flicker.

          ?theme=dark and ?theme=light force one for the length of the visit without
          overwriting what the person chose. It exists so a link can be shared in a
          particular theme, and it is also the only way to screenshot the other one.

          Wrapped in try/catch because localStorage throws outright in a browser with
          site data blocked, and a theme preference is not worth a blank page.
        */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var q=new URLSearchParams(location.search).get('theme');var t=q==='dark'||q==='light'?q:localStorage.getItem('trustfall-theme');if(t!=='dark'&&t!=='light')t=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';document.documentElement.setAttribute('data-theme',t)}catch(e){}`,
          }}
        />
      </head>
      <body className="flex min-h-full flex-col">
        <Providers>
          {/* Chrome decides what surrounds the page. Everywhere but /admin that is the
              site header and footer; on /admin it is an empty bar with the theme switch,
              because a log about what an agent did with somebody's money should not be one
              click from a page that acts on their behalf. */}
          <Chrome header={<SiteHeader />} footer={<SiteFooter />}>
            <div className="mx-auto w-full max-w-[90rem] flex-1 px-6 py-10">
              {/* Wraps the page, not the header. The header stays visible so the address on
                  screen is right there next to the warning explaining it. */}
              <IdentityGuard>{children}</IdentityGuard>
            </div>
          </Chrome>
        </Providers>
      </body>
    </html>
  );
}

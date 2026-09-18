import type { Metadata } from "next"
import { cookies } from "next/headers"
import { Righteous } from "next/font/google"
import "./globals.css"
import { Header } from "@/components/layout/Header"
import { PrefsRendered } from "@/hooks/usePrefs"
import { PREFS_COOKIE, readPrefs } from "@/lib/prefs"

/** The wordmark, and nothing else. A display face is the wrong thing to read a
 *  paragraph in, so it is bound to a variable rather than to the page, and the
 *  one element that wants it asks for it by name.
 *
 *  Self-hosted: next/font fetches it at build time and serves it from here, so
 *  a page does not go to Google to draw its own name. It also measures the
 *  face and writes a matching fallback of the same metrics, so the moment the
 *  real one arrives nothing reflows around it. */
const display = Righteous({
  weight: "400",
  subsets: ["latin"],
  display: "swap",
  // Named apart from the theme key that points at it, or the two would be
  // the same variable defined in terms of itself.
  variable: "--font-display-src",
})

export const metadata: Metadata = {
  title: "NeoVNDB",
  description: "A local mirror of the VNDB database.",
}

/** Reading the reader's preferences here is what lets every page be rendered
 *  in the script they asked for, rather than in English and then corrected.
 *  It costs the static rendering of the three pages that had it -- a cookie is
 *  per reader, so a page that depends on one cannot be one file for everybody. */
export default async function RootLayout({ children }: LayoutProps<"/">) {
  const prefs = readPrefs((await cookies()).get(PREFS_COOKIE)?.value)

  return (
    <html lang="en" className={`${display.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <PrefsRendered value={prefs}>
          <Header />
          {children}
        </PrefsRendered>
      </body>
    </html>
  )
}

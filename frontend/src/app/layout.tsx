import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { Righteous } from 'next/font/google';
import './globals.css';
import { Suspense, ViewTransition } from 'react';
import { Header } from '@/components/layout/Header';
import { Navigation } from '@/components/layout/Navigation';
import { Shortcuts } from '@/components/layout/Shortcuts';
import { PrefsRendered } from '@/hooks/usePrefs';
import { PREFS_COOKIE, readPrefs } from '@/lib/prefs';
import { NAME_COOKIE } from '@/lib/user';

/** The wordmark face, bound to a variable so only the logo uses it.
 *  next/font self-hosts it with a metric-matched fallback, so nothing reflows
 *  when it loads. */
const display = Righteous({
  weight: '400',
  subsets: ['latin'],
  display: 'swap',
  // Named apart from the theme key that points at it, or the two would be
  // the same variable defined in terms of itself.
  variable: '--font-display-src',
});

export const metadata: Metadata = {
  title: 'NeoVNDB',
  description: 'A local mirror of the VNDB database.',
};

/** Preferences come from the cookie here so pages render in the reader's
 *  chosen script without a correction after hydration. This makes these pages
 *  per-reader rather than static. */
export default async function RootLayout({ children }: LayoutProps<'/'>) {
  const jar = await cookies();
  const prefs = readPrefs(jar.get(PREFS_COOKIE)?.value);
  const name = jar.get(NAME_COOKIE)?.value ?? null;

  return (
    <html lang="en" className={`${display.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <PrefsRendered value={prefs}>
          {/* Reads the address, which a prerender does not have. */}
          <Suspense fallback={null}>
            <Navigation />
          </Suspense>
          <Header name={name} />
          <Shortcuts />
          {/* Every navigation is a transition, so this crossfades one page into
              the next (globals.css, .page) while the header holds still. */}
          <ViewTransition default="page">{children}</ViewTransition>
        </PrefsRendered>
      </body>
    </html>
  );
}

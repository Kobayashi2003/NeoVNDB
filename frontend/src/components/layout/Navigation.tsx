/** What a reader sees between asking for a page and getting it. A server page
 *  takes a few hundred milliseconds to answer, during which the old one stays
 *  up; without a sign, a click looks ignored. So a thin bar runs along the top
 *  and the results being replaced dim -- both only once the wait is long
 *  enough to notice. When the address changes, the columns that scroll on
 *  their own go back to the top, as the window does. */
'use client';

import { useEffect, useSyncExternalStore } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

/** Below this a navigation is instant to the eye, and a bar would flicker. */
const QUIET_MS = 120;
/** A navigation that never finishes (an error page, a dropped request) must
 *  not leave the bar running forever. */
const GIVE_UP_MS = 15_000;

let pending = false;
let shown = false;
let timers: ReturnType<typeof setTimeout>[] = [];
const listeners = new Set<() => void>();

function announce() {
  document.documentElement.toggleAttribute('data-navigating', shown);
  for (const notify of listeners) notify();
}

function clear() {
  for (const t of timers) clearTimeout(t);
  timers = [];
}

/** Starts the sign for a navigation to href; nothing if it goes nowhere new. */
function startNavigation(href: string) {
  const to = new URL(href, location.href);
  if (
    to.origin !== location.origin ||
    to.pathname + to.search === location.pathname + location.search
  )
    return;
  clear();
  pending = true;
  timers.push(
    setTimeout(() => {
      shown = pending;
      announce();
    }, QUIET_MS),
    setTimeout(finish, GIVE_UP_MS),
  );
}

function finish() {
  clear();
  if (!pending && !shown) return;
  pending = shown = false;
  announce();
}

/** router.push and replace, with the sign. */
export function useNavigate() {
  const router = useRouter();
  return {
    push(href: string) {
      startNavigation(href);
      router.push(href);
    },
    replace(href: string) {
      startNavigation(href);
      router.replace(href);
    },
  };
}

/** Clicks on links start the sign; a new address ends it. */
export function Navigation() {
  const path = usePathname();
  const search = useSearchParams().toString();
  const showing = useSyncExternalStore(
    notify => {
      listeners.add(notify);
      return () => void listeners.delete(notify);
    },
    () => shown,
    () => false,
  );

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const link = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
      if (!link || (link.target && link.target !== '_self') || link.hasAttribute('download'))
        return;
      // A link that knows this click will not take it anywhere says so.
      if (link.hasAttribute('data-inert')) return;
      startNavigation(link.href);
    };
    // Capturing: next/link prevents the default to navigate on the client,
    // so a listener after it could not tell its clicks from inert ones.
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, []);

  useEffect(() => {
    finish();
    for (const box of document.querySelectorAll<HTMLElement>('[data-scroll-top]'))
      box.scrollTop = 0;
  }, [path, search]);

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-x-0 top-0 z-[70] h-0.5 overflow-hidden"
    >
      <div
        className={
          showing
            ? 'h-full w-[85%] bg-accent transition-[width] duration-[8000ms] ease-out'
            : 'h-full w-0 bg-accent opacity-0 transition-opacity duration-200'
        }
      />
    </div>
  );
}

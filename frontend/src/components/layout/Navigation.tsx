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
let stopped: { img: HTMLImageElement; src: string }[] = [];

/** Images still loading on the page being left are dropped. Over HTTP/1.1 a
 *  browser keeps six connections to a host, and covers vndb has not given the
 *  mirror yet take seconds each: six of them held every connection, and the
 *  next page's request queued behind them (15s measured). Taking the src away,
 *  rather than emptying it, ends the request without an error event, so the
 *  card is not marked broken. The mirror finishes the fetch regardless. */
function stopImages() {
  for (const img of document.images) {
    const src = img.getAttribute('src');
    if (img.complete || !src) continue;
    stopped.push({ img, src });
    img.removeAttribute('src');
  }
}

/** Puts back what is still on the page: a navigation that never came, or an
 *  image the new page kept as it was. One React gave a new src is left be. */
function restoreImages() {
  for (const { img, src } of stopped)
    if (img.isConnected && !img.hasAttribute('src')) img.setAttribute('src', src);
  stopped = [];
}

/** Chrome now words the abort of a transition in a hidden tab as "…invalid
 *  state. Document hidden", which React 19.3 does not recognise among the
 *  aborts it ignores, so switching tabs mid-navigation raised a recoverable
 *  error. Reworded to the form React knows; React already recovers either way. */
const REWORDED = Symbol.for('neovndb.reworded');
// Once, though this module is evaluated again on every hot reload.
if (
  typeof document !== 'undefined' &&
  document.startViewTransition &&
  !(REWORDED in document.startViewTransition)
) {
  const start = document.startViewTransition.bind(document);
  document.startViewTransition = Object.assign(
    (...args: Parameters<typeof start>) => {
      const transition = start(...args);
      const ready = transition.ready.catch((error: unknown) => {
        throw error instanceof DOMException &&
          error.name === 'InvalidStateError' &&
          error.message.startsWith('Transition was aborted because of invalid state')
          ? new DOMException('Transition was aborted because of invalid state', error.name)
          : error;
      });
      Object.defineProperty(transition, 'ready', { value: ready });
      return transition;
    },
    { [REWORDED]: true },
  ) as typeof document.startViewTransition;
}

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
  stopImages();
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
  restoreImages();
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

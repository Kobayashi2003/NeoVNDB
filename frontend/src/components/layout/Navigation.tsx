/** What a reader sees between asking for a page and getting it. A server page
 *  takes a few hundred milliseconds to answer, during which the old one stays
 *  up; without a sign, a click looks ignored. So a thin bar runs along the top
 *  and the results being replaced dim -- both only once the wait is long
 *  enough to notice. When the address changes, the columns that scroll on
 *  their own go back to the top, as the window does. */
'use client';

import { useEffect, useLayoutEffect, useRef, useSyncExternalStore } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import {
  finishNavigation,
  isNavigating,
  isPendingNavigation,
  onNavigating,
  startNavigation,
  startPopState,
  watchTransition,
} from '@/lib/navigating';
import { onViewTransition, rewordHiddenAborts } from '@/lib/viewTransitions';

const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

/** Clicks on links start the sign; a new address ends it. */
export function Navigation() {
  const path = usePathname();
  const search = useSearchParams().toString();
  const showing = useSyncExternalStore(onNavigating, isNavigating, () => false);
  const lastAddress = useRef('');

  useEffect(() => {
    rewordHiddenAborts(document);
    const stopWatching = onViewTransition(watchTransition);
    const onClick = (e: MouseEvent) => {
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const link = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
      if (!link || (link.target && link.target !== '_self') || link.hasAttribute('download'))
        return;
      // A link that knows this click will not take it anywhere says so.
      if (link.hasAttribute('data-inert')) return;
      startNavigation(link.href);
    };
    // Back and forward: skip when only a #fragment changed, or when Next
    // already flushed a cached history entry synchronously before this listener
    // (window listeners fire in registration order, so marking afterward would
    // leave `data-moving` stuck with no matching commit).
    const onPopState = () => {
      const next = location.pathname + location.search;
      if (next === lastAddress.current) return;
      startPopState();
    };
    // Capturing: next/link prevents the default to navigate on the client,
    // so a listener after it could not tell its clicks from inert ones.
    document.addEventListener('click', onClick, true);
    window.addEventListener('popstate', onPopState);
    return () => {
      stopWatching();
      document.removeEventListener('click', onClick, true);
      window.removeEventListener('popstate', onPopState);
    };
  }, []);

  useIsomorphicLayoutEffect(() => {
    lastAddress.current = location.pathname + location.search;
    // Next skips scrolling to top when the new <main>'s top is still inside the
    // viewport -- which happens whenever the incoming page's initial height
    // clamps scrollY to (0, headerH] under the sticky header, letting scroll
    // anchoring drag the window down once client data arrives. Reset before the
    // new view-transition snapshot is captured, for forward moves without a hash.
    if (isPendingNavigation() && !location.hash && window.scrollY > 0) window.scrollTo(0, 0);
    for (const box of document.querySelectorAll<HTMLElement>('[data-scroll-top]'))
      box.scrollTop = 0;
  }, [path, search]);

  useEffect(() => {
    finishNavigation();
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

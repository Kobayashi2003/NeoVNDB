/** A button back to the top, once the reader is a screen or more down.
 *
 *  What scrolls differs by page: the window on lists and phones, the body
 *  column on a detail page from lg up (DetailShell). Scroll events do not
 *  bubble but are captured, so one listener on the document hears both, and
 *  the button takes back whichever one moved. */
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { ArrowUp } from 'lucide-react';
import { cn } from '@/lib/utils';

/** The scroll box in use: the page's own column if it scrolls, else the window. */
function scroller(): HTMLElement {
  for (const box of document.querySelectorAll<HTMLElement>('[data-scroll-top]')) {
    if (box.scrollHeight > box.clientHeight && getComputedStyle(box).overflowY !== 'visible')
      return box;
  }
  return document.scrollingElement as HTMLElement;
}

export function ToTop() {
  const [shown, setShown] = useState(false);
  const frame = useRef(0);
  const path = usePathname();

  const check = useCallback(() => {
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() =>
      setShown(scroller().scrollTop > window.innerHeight),
    );
  }, []);

  // A page left with its column scrolled down takes the column with it, and
  // nothing scrolls on the way to the next page, already at its top.
  useEffect(check, [path, check]);

  useEffect(() => {
    document.addEventListener('scroll', check, { capture: true, passive: true });
    window.addEventListener('resize', check);
    return () => {
      cancelAnimationFrame(frame.current);
      document.removeEventListener('scroll', check, { capture: true });
      window.removeEventListener('resize', check);
    };
  }, [check]);

  const toTop = () => {
    const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
    scroller().scrollTo({ top: 0, behavior: still ? 'instant' : 'smooth' });
    // The button goes once the page is at the top, so the focus goes on ahead
    // to the page's title rather than being dropped on the body.
    const title = document.querySelector<HTMLElement>('main h1');
    if (title) {
      title.tabIndex = -1;
      title.focus({ preventScroll: true });
    }
  };

  return (
    <button
      type="button"
      onClick={toTop}
      aria-label="Back to the top"
      title="Back to the top"
      className={cn(
        // Above the selection bar while it is up (components/ui/Selection).
        // Hidden by visibility, so it is out of reach for the pointer, the tab
        // key and screen readers; that switches at the end of the fade.
        'fixed bottom-4 right-4 z-30 flex size-10 items-center justify-center rounded-full border border-white/15 bg-[var(--overlay)] text-white/80 shadow-lg shadow-black/40 transition-[opacity,translate,visibility,color] duration-200 hover:text-accent in-data-selecting:bottom-24 motion-reduce:transition-none',
        !shown && 'invisible translate-y-2 opacity-0',
      )}
    >
      <ArrowUp className="size-4" aria-hidden />
    </button>
  );
}

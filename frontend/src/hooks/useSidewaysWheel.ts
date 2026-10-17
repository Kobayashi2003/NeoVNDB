/** A mouse wheel turns a row that scrolls sideways: most wheels only roll up
 *  and down, which over such a row would otherwise scroll the page past it.
 *  Only while the row can still move that way -- at either end the wheel goes
 *  back to scrolling the page, so it never traps the reader. A trackpad's own
 *  sideways swipe is left alone. */
'use client';

import { useEffect, type RefObject } from 'react';

/** `inside`, a selector, finds the row within the element `at` holds, for a
 *  row that a child component renders. */
export function useSidewaysWheel(at: RefObject<HTMLElement | null>, inside?: string) {
  useEffect(() => {
    const found = inside ? at.current?.querySelector(inside) : at.current;
    if (!(found instanceof HTMLElement)) return;
    const el = found;
    const turn = (e: WheelEvent) => {
      if (e.ctrlKey || Math.abs(e.deltaX) >= Math.abs(e.deltaY)) return;
      const room = el.scrollWidth - el.clientWidth;
      if (room <= 1) return;
      const atStart = el.scrollLeft <= 0 && e.deltaY < 0;
      const atEnd = el.scrollLeft >= room - 1 && e.deltaY > 0;
      if (atStart || atEnd) return;
      e.preventDefault();
      // A line-mode wheel (Firefox) reports lines, not pixels.
      el.scrollBy({ left: e.deltaMode === 1 ? e.deltaY * 32 : e.deltaY });
    };
    // Not passive: it has to be able to keep the page from scrolling too.
    el.addEventListener('wheel', turn, { passive: false });
    return () => el.removeEventListener('wheel', turn);
  }, [at, inside]);
}

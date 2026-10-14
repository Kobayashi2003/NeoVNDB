/** Shifts an open menu back on screen, measured when it opens and written
 *  straight to the node. The shift never exceeds the room on the other side,
 *  so fixing one edge cannot push the other off. */
'use client';

import { useEffect, useRef } from 'react';

export function useKeptOnScreen<T extends HTMLElement>(open: boolean) {
  const ref = useRef<T>(null);

  useEffect(() => {
    const el = ref.current;
    if (!open || !el) return;

    el.style.transform = '';
    const box = el.getBoundingClientRect();
    const margin = 8;

    // clientWidth, not innerWidth: the page always reserves its scrollbar's
    // gutter, and a panel under it is clipped.
    const width = document.documentElement.clientWidth;
    const pastRight = box.right - (width - margin);
    const pastLeft = margin - box.left;

    let shift = 0;
    if (pastRight > 0) shift = -Math.min(pastRight, Math.max(box.left - margin, 0));
    else if (pastLeft > 0) shift = Math.min(pastLeft, Math.max(width - margin - box.right, 0));

    el.style.transform = shift === 0 ? '' : `translateX(${shift}px)`;
  }, [open]);

  return ref;
}

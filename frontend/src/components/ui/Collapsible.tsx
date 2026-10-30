/** Clamps long prose and offers to unfold it -- but only once it measures tall
 *  enough to be worth clamping, so a two-line description never grows a
 *  pointless button.
 *
 *  The clamp is there from the server's markup on, and the offer to unfold
 *  sits inside the clamped box, in the fade: whether the text is long is only
 *  known once the page is live, and anything that changed height then moved
 *  everything under it (sidebars under an About card shifted on a slow line).
 *  A short text is below the clamp anyway, so clamping it changes nothing.
 *
 *  The text itself fades (a mask), not a gradient painted over it: the cards
 *  are translucent, so no colour laid on top matched them, and the cut line
 *  showed through it as a smear. */
'use client';

import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { Chevron, pill } from './Pill';

/** The last stretch of the clamp, where the text fades out: gone by the top of
 *  the button (28px), so no line shows through it. */
const FADE =
  '[mask-image:linear-gradient(to_bottom,#000_calc(100%-5.5rem),transparent_calc(100%-1.75rem))]';

export function Collapsible({
  maxHeight = 220,
  children,
}: {
  maxHeight?: number;
  children: React.ReactNode;
}) {
  const body = useRef<HTMLDivElement>(null);
  const [overflows, setOverflows] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const el = body.current;
    if (!el) return;
    const measure = () => setOverflows(el.scrollHeight > maxHeight + 8);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [maxHeight]);

  const toggle = (
    <button
      type="button"
      onClick={() => setOpen(!open)}
      aria-expanded={open}
      className={pill({ className: 'gap-1.5 pl-3.5 pr-3' })}
    >
      {open ? 'Show less' : 'Show more'}
      <Chevron open={open} className="size-3.5" />
    </button>
  );

  return (
    <div className="relative">
      <div
        ref={body}
        style={{ maxHeight: open ? undefined : maxHeight }}
        className={cn('overflow-hidden', overflows && !open && FADE)}
      >
        {children}
      </div>

      {overflows && !open && (
        <div className="absolute inset-x-0 bottom-0 flex justify-center">{toggle}</div>
      )}
      {overflows && open && <div className="mt-3 flex justify-center">{toggle}</div>}
    </div>
  );
}

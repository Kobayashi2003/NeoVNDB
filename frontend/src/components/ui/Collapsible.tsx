/** Clamps long prose and offers to unfold it -- but only once it measures tall
 *  enough to be worth clamping, so a two-line description never grows a
 *  pointless button.
 *
 *  The clamp is there from the server's markup on, and the offer to unfold
 *  sits inside the clamped box, over the fade: whether the text is long is only
 *  known once the page is live, and anything that changed height then moved
 *  everything under it (sidebars under an About card shifted on a slow line).
 *  A short text is below the clamp anyway, so clamping it changes nothing. */
'use client';

import { useEffect, useRef, useState } from 'react';
import { Chevron } from './Pill';

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
      onClick={() => setOpen(!open)}
      className="relative flex items-center gap-1 text-xs text-muted transition-colors hover:text-accent coarse:py-1"
    >
      <Chevron open={open} className="size-3.5" />
      {open ? 'Show less' : 'Show more'}
    </button>
  );

  return (
    <div className="relative">
      <div
        ref={body}
        style={{ maxHeight: open ? undefined : maxHeight }}
        className="overflow-hidden"
      >
        {children}
      </div>

      {overflows && !open && (
        <div className="absolute inset-x-0 bottom-0 flex h-12 items-end bg-gradient-to-t from-[var(--surface)] from-30% to-transparent">
          {toggle}
        </div>
      )}
      {overflows && open && <div className="mt-1">{toggle}</div>}
    </div>
  );
}

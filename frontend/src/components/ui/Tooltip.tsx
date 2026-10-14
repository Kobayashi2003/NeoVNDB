/** A label on hover, focus and tap (`title` is slow and unreachable by
 *  touch). Portalled to the body to escape scroll clipping; closes on scroll,
 *  so its position is set once when it opens. */
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';

export function Tooltip({
  label,
  className,
  children,
}: {
  label: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  const [at, setAt] = useState<{ x: number; y: number } | null>(null);
  const ref = useRef<HTMLSpanElement>(null);

  const show = useCallback(() => {
    const box = ref.current?.getBoundingClientRect();
    if (box) setAt({ x: box.left + box.width / 2, y: box.top });
  }, []);
  const hide = useCallback(() => setAt(null), []);

  useEffect(() => {
    if (!at) return;
    // Registered after the opening event has finished propagating, so the tap
    // that opened this one does not immediately close it.
    window.addEventListener('scroll', hide, true);
    window.addEventListener('touchstart', hide);
    return () => {
      window.removeEventListener('scroll', hide, true);
      window.removeEventListener('touchstart', hide);
    };
  }, [at, hide]);

  if (label === null || label === undefined || label === '') return <>{children}</>;

  return (
    <span
      ref={ref}
      className={cn('inline-flex', className)}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
      onTouchStart={show}
    >
      {children}
      {at &&
        createPortal(
          <span
            role="tooltip"
            style={{ left: at.x, top: at.y }}
            className="pointer-events-none fixed z-60 -mt-1.5 max-w-[min(20rem,90vw)] -translate-x-1/2 -translate-y-full rounded border border-white/10 bg-black/90 px-1.5 py-0.5 text-[11px] leading-tight text-white/90 shadow-lg"
          >
            {label}
          </span>,
          document.body,
        )}
    </span>
  );
}

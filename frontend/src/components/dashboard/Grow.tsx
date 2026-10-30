/** A chart's bar. Its size goes from what it was to what it is through a
 *  transition, so a change of data or of grain moves the bars rather than
 *  replacing them; a bar new to the chart starts that from zero. */
'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

export function Grow({
  along,
  size,
  className,
}: {
  /** Which way it grows: up for a column, across for a ranking row. */
  along: 'height' | 'width';
  /** A CSS length, or 0. */
  size: string | 0;
  className?: string;
}) {
  // Zero for its first frame, so a new bar has a start to grow from.
  const [grown, setGrown] = useState(false);
  useEffect(() => {
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => setGrown(true));
    });
    return () => cancelAnimationFrame(frame);
  }, []);
  return (
    <span
      className={cn('block motion-safe:duration-500 motion-safe:ease-out', className)}
      style={{ [along]: grown ? size : 0 }}
    />
  );
}

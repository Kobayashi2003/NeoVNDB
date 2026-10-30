/** A number that counts its way to a new value instead of jumping, so a change
 *  reads as more or fewer. Straight to the value under reduced motion, and on
 *  first paint. */
'use client';

import { useEffect, useRef, useState } from 'react';

const DURATION = 450;

export function Rolling({ value, format }: { value: number; format: (n: number) => string }) {
  const [shown, setShown] = useState(value);
  const from = useRef(value);

  useEffect(() => {
    const start = from.current;
    if (start === value || matchMedia('(prefers-reduced-motion: reduce)').matches) {
      from.current = value;
      setShown(value);
      return;
    }
    const t0 = performance.now();
    let frame = requestAnimationFrame(function step(now) {
      const t = Math.min(1, (now - t0) / DURATION);
      // Ease out: quick to leave, settling onto the value.
      const at = start + (value - start) * (1 - (1 - t) ** 3);
      from.current = at;
      setShown(t === 1 ? value : at);
      if (t < 1) frame = requestAnimationFrame(step);
    });
    return () => cancelAnimationFrame(frame);
  }, [value]);

  return <>{format(shown)}</>;
}

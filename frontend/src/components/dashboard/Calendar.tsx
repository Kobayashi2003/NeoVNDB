/** A year of days, a column per week: how many titles came in each day, in
 *  steps of the accent from none to the busiest. A day with any is a toggle
 *  that narrows the dashboard to it. Scrolls sideways on a phone, starting at
 *  the recent end. */
'use client';

import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import type { Bucket } from '@/lib/dashboard';

const STEPS = ['bg-white/5', 'bg-accent/30', 'bg-accent/55', 'bg-accent/80', 'bg-accent'];

export function Calendar({
  weeks,
  unit,
  picked,
  onPick,
}: {
  weeks: (Bucket | null)[][];
  unit: string;
  picked?: string;
  onPick: (key: string | undefined) => void;
}) {
  const [hover, setHover] = useState<Bucket | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const days = weeks.flat().filter((d): d is Bucket => !!d);
  const max = Math.max(1, ...days.map(d => d.count));
  const step = (n: number) => (n === 0 ? 0 : Math.min(4, Math.ceil((n / max) * 4)));
  const shown = hover ?? days.find(d => d.key === picked);

  useEffect(() => {
    if (box.current) box.current.scrollLeft = box.current.scrollWidth;
  }, [weeks]);

  return (
    <div className="flex flex-col gap-2">
      <p className="h-5 text-xs" aria-live="polite">
        {shown ? (
          <>
            <strong className="font-semibold tabular-nums">{shown.count}</strong>{' '}
            <span className="text-muted">
              {unit}, {shown.key}
            </span>
          </>
        ) : (
          <span className="text-muted">The busiest day had {max.toLocaleString()}</span>
        )}
      </p>
      <div ref={box} className="overflow-x-auto pb-1" onPointerLeave={() => setHover(null)}>
        <div className="flex w-max gap-[3px]" role="group" aria-label={`${unit} per day`}>
          {weeks.map((week, w) => (
            <div key={w} className="flex flex-col gap-[3px]">
              {week.map((d, i) =>
                d ? (
                  <button
                    key={d.key}
                    type="button"
                    disabled={d.count === 0}
                    aria-pressed={d.key === picked}
                    aria-label={`${d.key}: ${d.count} ${unit}`}
                    onClick={() => onPick(d.key === picked ? undefined : d.key)}
                    onPointerEnter={() => setHover(d)}
                    onFocus={() => setHover(d)}
                    onBlur={() => setHover(null)}
                    className={cn(
                      'size-3 rounded-[3px] outline-none enabled:cursor-pointer focus-visible:ring-2 focus-visible:ring-white/60',
                      STEPS[step(d.count)],
                      picked !== undefined && d.key !== picked && d.count > 0 && 'opacity-40',
                      d.key === picked && 'ring-2 ring-white/80',
                    )}
                  />
                ) : (
                  <div key={i} className="size-3" />
                ),
              )}
            </div>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-1 text-[0.625rem] text-muted" aria-hidden>
        Fewer
        {STEPS.map(s => (
          <span key={s} className={cn('size-2.5 rounded-[3px]', s)} />
        ))}
        More
      </div>
    </div>
  );
}

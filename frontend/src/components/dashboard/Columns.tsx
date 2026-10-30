/** A column chart of one series: thin columns from a hairline baseline, a few
 *  labels along the bottom, and a readout for the column under the pointer or
 *  the keyboard. With `onPick` each column is a toggle: picking one narrows
 *  the rest of the dashboard to the titles under it. */
'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { Grow } from './Grow';

export interface Column {
  key: string;
  /** Under the column, where there is room for it. */
  label: string;
  /** In the readout. */
  title: string;
  value: number;
}

/** About this many labels fit under a chart half the page wide. */
const LABELS = 6;
/** Up to this many columns, each carries its count above it. */
const COUNTED = 8;

export function Columns({
  data,
  unit,
  label,
  picked,
  onPick,
}: {
  data: Column[];
  unit: string;
  label: string;
  picked?: string;
  onPick?: (key: string | undefined) => void;
}) {
  const [hover, setHover] = useState<number | null>(null);
  // The same frame as a drawn chart, so nothing moves when the data comes.
  if (data.length === 0)
    return (
      <div className="flex flex-col gap-1.5">
        <p className="h-5" />
        <p className="flex h-36 items-center justify-center border-b border-white/10 text-xs text-muted">
          Nothing yet.
        </p>
        <p className="h-4" />
      </div>
    );
  const max = Math.max(1, ...data.map(d => d.value));
  const total = data.reduce((s, d) => s + d.value, 0);
  const every = Math.max(1, Math.ceil(data.length / LABELS));
  const shown = hover !== null ? data[hover] : data.find(d => d.key === picked);
  const counted = data.length <= COUNTED;
  const pickedAt = data.findIndex(d => d.key === picked);
  // Counted from the right, so the latest column is always named; a picked
  // column is named too, and its neighbours give way rather than overprint it.
  const labelled = (i: number) =>
    i === pickedAt ||
    ((data.length - 1 - i) % every === 0 && (pickedAt < 0 || Math.abs(i - pickedAt) >= every));

  return (
    <div className="flex flex-col gap-1.5">
      <p className="flex h-5 items-baseline justify-between gap-3 text-xs" aria-live="polite">
        <span className="min-w-0 truncate">
          <strong className="font-semibold tabular-nums">
            {(shown?.value ?? total).toLocaleString()}
          </strong>{' '}
          <span className="text-muted">{shown ? `${unit}, ${shown.title}` : `${unit} in all`}</span>
        </span>
        {!counted && (
          <span className="shrink-0 text-[0.625rem] tabular-nums text-muted">
            most {max.toLocaleString()}
          </span>
        )}
      </p>
      <div
        role="group"
        aria-label={label}
        className={cn(
          'flex h-36 items-end gap-0.5 border-b border-white/10',
          // Room above the tallest column for its count.
          counted && 'pt-4',
        )}
        onPointerLeave={() => setHover(null)}
      >
        {/* Keyed by place, not by key: from year to month, or one range to
            another, each column grows or shrinks from where it stood. */}
        {data.map((d, i) => {
          const on = d.key === picked;
          // Nothing to narrow to; it still answers the pointer, so its zero reads out.
          const empty = d.value === 0 && !on;
          const props = {
            'aria-label': `${d.title}: ${d.value} ${unit}`,
            onPointerEnter: () => setHover(i),
            onFocus: () => setHover(i),
            onBlur: () => setHover(null),
            // The whole slot answers, not only the painted column.
            className: cn(
              'group flex h-full min-w-0 flex-1 flex-col items-center justify-end rounded-t outline-none',
              onPick && !empty ? 'cursor-pointer' : 'cursor-default',
            ),
          };
          const bar = (
            <>
              {counted && (
                <span
                  className={cn(
                    'pb-1 text-[0.625rem] leading-3 tabular-nums text-muted transition-colors',
                    (on || hover === i) && 'text-white',
                  )}
                  aria-hidden
                >
                  {d.value.toLocaleString()}
                </span>
              )}
              <Grow
                along="height"
                size={d.value ? `${Math.max(2, (d.value / max) * 100)}%` : 0}
                className={cn(
                  'w-full max-w-6 shrink-0 rounded-t motion-safe:transition-[height,opacity,background-color]',
                  'group-focus-visible:ring-2 group-focus-visible:ring-white/60',
                  picked === undefined || on ? 'bg-accent' : 'bg-accent/30',
                  hover !== null && hover !== i && !on && 'opacity-60',
                )}
              />
            </>
          );
          return onPick ? (
            <button
              key={i}
              type="button"
              aria-pressed={on}
              aria-disabled={empty || undefined}
              onClick={() => !empty && onPick(on ? undefined : d.key)}
              {...props}
            >
              {bar}
            </button>
          ) : (
            <div key={i} tabIndex={0} {...props}>
              {bar}
            </div>
          );
        })}
      </div>
      <div className="flex h-4 gap-0.5 text-[0.625rem] leading-4 text-muted" aria-hidden>
        {data.map((d, i) => (
          <span
            key={i}
            className={cn(
              'min-w-0 flex-1 overflow-visible whitespace-nowrap text-center',
              d.key === picked && 'text-white',
            )}
          >
            {labelled(i) ? d.label : ''}
          </span>
        ))}
      </div>
    </div>
  );
}

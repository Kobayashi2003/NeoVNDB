/** A ranked list as bars: who or what comes up most among the titles. A row
 *  is a link to it, or with `onPick` a toggle that narrows the dashboard to
 *  it. The count is printed, so the bar only helps compare. */
'use client';

import Link from 'next/link';
import { cn } from '@/lib/utils';

/** Rows held for a ranking still being counted: the read API's default top. */
const PLACEHOLDERS = 10;

export interface Ranked {
  id: string;
  href?: string;
  label: string;
  count: number;
}

export function Ranking({
  rows,
  picked,
  onPick,
}: {
  /** Undefined while still being counted. */
  rows: Ranked[] | undefined;
  picked?: string;
  onPick?: (id: string | undefined) => void;
}) {
  if (!rows)
    return (
      <ol className="flex flex-col" aria-hidden>
        {Array.from({ length: PLACEHOLDERS }, (_, i) => (
          <li key={i} className="flex flex-col gap-1 py-1">
            <span className="h-4 w-1/3 animate-pulse rounded bg-white/5" />
            <span className="h-1 rounded-full bg-white/5" />
          </li>
        ))}
      </ol>
    );
  if (rows.length === 0)
    return (
      <p className="flex h-full items-center justify-center text-xs text-muted">Nothing yet.</p>
    );
  const max = Math.max(...rows.map(r => r.count));
  const row =
    'group grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 rounded py-1 text-left text-xs outline-none focus-visible:ring-2 focus-visible:ring-white/60';
  return (
    <ol className="flex flex-col">
      {rows.map(r => {
        const on = r.id === picked;
        const inner = (
          <>
            <span
              className={cn(
                'truncate transition-colors group-hover:text-accent',
                on && 'text-accent',
              )}
            >
              {r.label}
            </span>
            <span className="tabular-nums text-muted">{r.count.toLocaleString()}</span>
            <span className="col-span-2 h-1 overflow-hidden rounded-full bg-white/5">
              <span
                className={cn(
                  'block h-full rounded-full motion-safe:transition-[width] motion-safe:duration-300',
                  picked === undefined || on ? 'bg-accent' : 'bg-accent/30',
                )}
                style={{ width: `${(r.count / max) * 100}%` }}
              />
            </span>
          </>
        );
        return (
          <li key={r.id}>
            {onPick ? (
              <button
                type="button"
                aria-pressed={on}
                onClick={() => onPick(on ? undefined : r.id)}
                className={row}
              >
                {inner}
              </button>
            ) : r.href ? (
              <Link href={r.href} className={row}>
                {inner}
              </Link>
            ) : (
              <span className={row}>{inner}</span>
            )}
          </li>
        );
      })}
    </ol>
  );
}

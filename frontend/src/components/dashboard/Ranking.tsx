/** A ranked list as bars: who or what comes up most among the titles. A row
 *  is a link to it, or with `onPick` a toggle that narrows the dashboard to
 *  it. The count is printed, so the bar only helps compare. */
'use client';

import Link from 'next/link';
import { cn } from '@/lib/utils';
import { Grow } from './Grow';

/** A part of a whole as a percentage, never a misleading 0% for a few. */
export function share(n: number, of: number): string {
  if (!of || !n) return '—';
  const p = (n / of) * 100;
  return p < 1 ? '<1%' : `${Math.round(p)}%`;
}

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
  of,
  format = n => n.toLocaleString(),
}: {
  /** Undefined while still being counted. */
  rows: Ranked[] | undefined;
  picked?: string;
  onPick?: (id: string | undefined) => void;
  /** The whole the counts are parts of: each row then says its share. */
  of?: number;
  /** How a count is printed, where it is not a plain number (a rating). */
  format?: (count: number) => string;
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
      {/* Keyed by place: on another role or category, each bar moves from
          the length it had. */}
      {rows.map((r, i) => {
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
            <span className="tabular-nums text-muted">
              {format(r.count)}
              {of ? (
                // A column of its own width, so the shares line up.
                <span className="ml-2 inline-block w-8 text-right text-[0.6875rem] text-muted/70">
                  {share(r.count, of)}
                </span>
              ) : null}
            </span>
            <span className="col-span-2 h-1 overflow-hidden rounded-full bg-white/5">
              <Grow
                along="width"
                size={`${(r.count / max) * 100}%`}
                className={cn(
                  'h-full rounded-full motion-safe:transition-[width]',
                  picked === undefined || on ? 'bg-accent' : 'bg-accent/30',
                )}
              />
            </span>
          </>
        );
        return (
          <li key={i}>
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

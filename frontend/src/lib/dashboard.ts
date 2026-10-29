/** The reader's dashboard, reduced to plain data: which titles are in scope
 *  and when each came in, counted by year, month or day. Nothing here fetches;
 *  components/dashboard does that and draws the result. */

import type { VNRow } from './types';

/** A title as the dashboard reads it: a card's fields and its language. */
export type Detail = VNRow & { olang: string };

/** The read API's id ceiling as deployed: one request names at most this many,
 *  so a longer scope is counted by its most recent titles. */
export const MAX_IDS = 1000;

/** A title in scope and when it came in: first added to any list, or rated. */
export interface Entry {
  id: string;
  /** An ISO timestamp. */
  at: string;
  rating: number | null;
}

/** Every visual novel the reader holds, at the date it first entered one of
 *  their lists, with their rating if they gave one. */
export function fromLists(
  lists: { id: string; marked_at: string }[][],
  ratings: Map<string, number>,
): Entry[] {
  const first = new Map<string, string>();
  for (const marks of lists) {
    for (const m of marks) {
      const seen = first.get(m.id);
      if (!seen || m.marked_at < seen) first.set(m.id, m.marked_at);
    }
  }
  return [...first].map(([id, at]) => ({ id, at, rating: ratings.get(id) ?? null }));
}

export type Range = 'all' | '12m' | `${number}`;
export type Grain = 'year' | 'month' | 'day';

/** The dates a range covers, as YYYY-MM-DD bounds; `from` is null for all of
 *  time. Ranges end today. */
export function bounds(range: Range, today: Date): { from: string | null; to: string } {
  const to = day(today);
  if (range === 'all') return { from: null, to };
  if (range === '12m') {
    const from = new Date(today);
    from.setUTCFullYear(from.getUTCFullYear() - 1);
    from.setUTCDate(from.getUTCDate() + 1);
    return { from: day(from), to };
  }
  return { from: `${range}-01-01`, to: `${range}-12-31` < to ? `${range}-12-31` : to };
}

export function inRange(entries: Entry[], range: Range, today: Date): Entry[] {
  const { from, to } = bounds(range, today);
  return entries.filter(
    e => (from === null || e.at.slice(0, 10) >= from) && e.at.slice(0, 10) <= to,
  );
}

/** The years any entry falls in, newest first, for the range menu. */
export function years(entries: Entry[]): number[] {
  return [...new Set(entries.map(e => Number(e.at.slice(0, 4))))].sort((a, b) => b - a);
}

export interface Bucket {
  /** 2026, 2026-03 or 2026-03-14. */
  key: string;
  count: number;
}

/** Counts per year or month, every bucket between the first and the last
 *  included so a quiet stretch shows as a gap rather than closing up. Given
 *  the range's `bounds`, the buckets run to its end, from its start or, for
 *  all of time by month, from a year back at least, so a burst of additions
 *  is not one column alone. */
export function buckets(
  dates: string[],
  grain: 'year' | 'month',
  span?: { from: string | null; to: string },
): Bucket[] {
  const width = grain === 'year' ? 4 : 7;
  const counts = new Map<string, number>();
  for (const d of dates) counts.set(d.slice(0, width), (counts.get(d.slice(0, width)) ?? 0) + 1);
  if (counts.size === 0) return [];
  const keys = [...counts.keys()].sort();
  let first = keys[0];
  let last = keys[keys.length - 1];
  if (span) {
    const end = span.to.slice(0, width);
    if (end > last) last = end;
    let start = span.from?.slice(0, width);
    if (start === undefined && grain === 'month') {
      start = last;
      for (let i = 0; i < 11; i++) start = prev(start);
    }
    if (start !== undefined && start < first) first = start;
  }
  const out: Bucket[] = [];
  for (let k = first; k <= last; k = next(k, grain)) {
    out.push({ key: k, count: counts.get(k) ?? 0 });
  }
  return out;
}

function next(key: string, grain: 'year' | 'month'): string {
  if (grain === 'year') return String(Number(key) + 1);
  const [y, m] = key.split('-').map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
}

function prev(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
}

/** A calendar of days, a column per week starting Monday, for the last
 *  `weeks` weeks up to `to`. Days after `to` are null. */
export function calendar(dates: string[], to: string, weeks = 53): (Bucket | null)[][] {
  const counts = new Map<string, number>();
  for (const d of dates) counts.set(d.slice(0, 10), (counts.get(d.slice(0, 10)) ?? 0) + 1);
  const end = new Date(`${to}T00:00:00Z`);
  // Back to the Monday that starts the last week, then the weeks before it.
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - ((end.getUTCDay() + 6) % 7) - 7 * (weeks - 1));
  const columns: (Bucket | null)[][] = [];
  for (let w = 0; w < weeks; w++) {
    const column: (Bucket | null)[] = [];
    for (let d = 0; d < 7; d++) {
      const at = new Date(start);
      at.setUTCDate(start.getUTCDate() + w * 7 + d);
      const key = day(at);
      column.push(at > end ? null : { key, count: counts.get(key) ?? 0 });
    }
    columns.push(column);
  }
  return columns;
}

/** The finest grain worth offering for a range: a day apiece needs a year or
 *  less, or the calendar would not hold it. */
export function grains(range: Range): Grain[] {
  return range === 'all' ? ['year', 'month'] : ['year', 'month', 'day'];
}

/** The grain a range opens at: a span of a few years reads better by month,
 *  where by year it would be one or two columns. */
export function defaultGrain(range: Range, entries: Entry[]): Grain {
  if (range !== 'all') return 'month';
  const span = years(entries);
  return span.length && span[0] - span[span.length - 1] < 2 ? 'month' : 'year';
}

/** A column the reader picked in one chart, which narrows every other chart to
 *  the titles under it. `added` and `released` are a date prefix (2026,
 *  2026-03, 2026-03-14); the rest an exact value. */
export interface Picks {
  added?: string;
  released?: string;
  rating?: number;
  length?: number;
  olang?: string;
}

export type Facet = keyof Picks;

/** The entries every pick but `except` lets through: a chart is drawn from
 *  the others' narrowing so its own columns stay up to pick between. A pick on
 *  a title's own fields drops a title not fetched yet. */
export function narrow(
  entries: Entry[],
  details: Map<string, Detail>,
  picks: Picks,
  except?: Facet,
): Entry[] {
  const on = (f: Facet) => f !== except && picks[f] !== undefined;
  return entries.filter(e => {
    const d = details.get(e.id);
    if (on('added') && !e.at.startsWith(picks.added!)) return false;
    if (on('rating') && e.rating !== picks.rating) return false;
    if (!on('released') && !on('length') && !on('olang')) return true;
    if (!d) return false;
    if (on('released') && !d.released.startsWith(picks.released!)) return false;
    if (on('length') && d.length !== picks.length) return false;
    if (on('olang') && d.olang !== picks.olang) return false;
    return true;
  });
}

/** How much a title counts toward recommendations: more the better the reader
 *  rated it, against it when they disliked it, plainly when unrated. */
export function weight(rating: number | null): number {
  if (rating === null) return 1;
  return [-1, 0.25, 1, 1.5, 2][rating - 1] ?? 1;
}

export interface Disagreement {
  id: string;
  mine: number;
  /** vndb's, 10-100. */
  theirs: number;
  /** Mine on vndb's scale (1 star 20, 5 stars 100) less theirs. */
  by: number;
}

/** Where the reader's rating parts furthest from vndb's, either way: the most
 *  above, then the most below, `n` of each. */
export function disagreements(
  rated: { id: string; mine: number; theirs: number | null }[],
  n: number,
): { above: Disagreement[]; below: Disagreement[] } {
  const all = rated
    .filter((r): r is { id: string; mine: number; theirs: number } => r.theirs !== null)
    .map(r => ({ ...r, by: r.mine * 20 - r.theirs }));
  return {
    above: all
      .filter(d => d.by > 0)
      .sort((a, b) => b.by - a.by)
      .slice(0, n),
    below: all
      .filter(d => d.by < 0)
      .sort((a, b) => a.by - b.by)
      .slice(0, n),
  };
}

/** How many of each value, most first, ties by value. */
export function tally<T extends string | number>(values: T[]): { value: T; count: number }[] {
  const counts = new Map<T, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count || String(a.value).localeCompare(String(b.value)));
}

function day(d: Date): string {
  return d.toISOString().slice(0, 10);
}

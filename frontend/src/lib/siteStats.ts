/** The statistics page's counts of the whole database, made into what its
 *  charts draw: every step of a range present (a quiet stretch shows as a
 *  gap rather than closing up), one sex or all of them, a median to quote. */
import type { BySex, Counted } from '@/lib/api';
import type { Column } from '@/components/dashboard/Columns';

/** Whose characters a chart counts: everyone's, or one sex's. */
export type Sex = 'all' | 'f' | 'm';

/** Every step from `from` to `to`, the missing ones as nothing. */
export function filled(counts: Counted[], from: number, to: number, step = 1): Column[] {
  const by = new Map(counts.map(c => [Number(c.key), c.count]));
  const out: Column[] = [];
  for (let k = from; k <= to; k += step) {
    out.push({ key: String(k), label: String(k), title: String(k), value: by.get(k) ?? 0 });
  }
  return out;
}

/** Every year from the first counted to the last. */
export function years(counts: Counted[]): Column[] {
  if (counts.length === 0) return [];
  const keys = counts.map(c => Number(c.key));
  return filled(counts, Math.min(...keys), Math.max(...keys));
}

/** Every month (YYYY-MM) from the first counted to the last. */
export function months(counts: Counted[]): Column[] {
  if (counts.length === 0) return [];
  const by = new Map(counts.map(c => [c.key, c.count]));
  const keys = counts.map(c => c.key).sort();
  let [y, m] = keys[0].split('-').map(Number);
  const [y1, m1] = keys[keys.length - 1].split('-').map(Number);
  const out: Column[] = [];
  while (y < y1 || (y === y1 && m <= m1)) {
    const key = `${y}-${String(m).padStart(2, '0')}`;
    out.push({ key, label: key, title: key, value: by.get(key) ?? 0 });
    [y, m] = m === 12 ? [y + 1, 1] : [y, m + 1];
  }
  return out;
}

/** Monthly counts summed by year. */
export function byYear(monthly: Counted[]): Counted[] {
  return summed([monthly.map(c => ({ key: c.key.slice(0, 4), count: c.count }))]);
}

/** Counts that share a key added together, in the order keys first appear. */
export function summed(lists: Counted[][]): Counted[] {
  const by = new Map<string, number>();
  for (const list of lists) for (const c of list) by.set(c.key, (by.get(c.key) ?? 0) + c.count);
  return [...by].map(([key, count]) => ({ key, count }));
}

/** One sex's counts, or every sex's (the unknown included) added up. */
export function ofSex(counts: BySex, sex: Sex): Counted[] {
  return sex === 'all' ? summed(Object.values(counts)) : (counts[sex] ?? []);
}

/** Numeric keys gathered into steps of `step`, each keyed by its floor. */
export function stepped(counts: Counted[], step: number): Counted[] {
  return summed([
    counts.map(c => ({ key: String(Math.floor(Number(c.key) / step) * step), count: c.count })),
  ]);
}

export function total(counts: Counted[]): number {
  return counts.reduce((s, c) => s + c.count, 0);
}

/** The count under one key, nothing when it is missing. */
export function valueOf(counts: Counted[], key: string): number {
  return counts.find(c => c.key === key)?.count ?? 0;
}

/** Most first: counts added up across sexes keep the first sex's order. */
export function byCount(counts: Counted[]): Counted[] {
  return [...counts].sort((a, b) => b.count - a.count);
}

/** The smallest numeric key, so a chart starts where its data does. */
export function lowest(counts: Counted[]): number {
  return counts.length ? Math.min(...counts.map(c => Number(c.key))) : 0;
}

/** A half-point step keyed ×10 (65) as the span it covers (6.5–6.99); the
 *  top one holds a 10 too. */
export function halfPoint(key: number | null): string {
  if (key === null) return '—';
  const r = key / 10;
  return `${r.toFixed(1)}–${r >= 9.5 ? '10' : (r + 0.49).toFixed(2)}`;
}

/** The middle of numeric keys weighted by their counts; null for none. */
export function median(counts: Counted[]): number | null {
  const sorted = [...counts].sort((a, b) => Number(a.key) - Number(b.key));
  const half = total(sorted) / 2;
  if (half === 0) return null;
  let seen = 0;
  for (const c of sorted) {
    seen += c.count;
    if (seen >= half) return Number(c.key);
  }
  return null;
}

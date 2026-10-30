import { describe, expect, it } from 'vitest';
import {
  bounds,
  buckets,
  calendar,
  defaultGrain,
  disagreements,
  fromLists,
  grains,
  inRange,
  local,
  narrow,
  tally,
  weight,
  years,
  type Detail,
} from '@/lib/dashboard';

const today = new Date('2026-10-29T12:00:00Z');

describe('dashboard', () => {
  it('holds each title once, at the day it first entered a list', () => {
    const entries = fromLists(
      [
        [
          { id: 'v1', marked_at: '2026-03-02T10:00:00+08:00' },
          { id: 'v2', marked_at: '2025-01-01T00:00:00+08:00' },
        ],
        [{ id: 'v1', marked_at: '2024-07-07T00:00:00+08:00' }],
      ],
      new Map([['v2', 4]]),
    );
    // On the reader's clock, whatever offset the service wrote.
    expect(entries).toEqual([
      { id: 'v1', at: local('2024-07-07T00:00:00+08:00'), rating: null },
      { id: 'v2', at: local('2025-01-01T00:00:00+08:00'), rating: 4 },
    ]);
    expect(entries[0].at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/);
    expect(years(entries)).toEqual([2025, 2024]);
  });

  it('counts what was added just now, whatever the hour', () => {
    // Shortly after the reader's midnight, when the UTC day is still the last.
    const now = new Date(2026, 9, 30, 0, 30);
    const added = new Date(2026, 9, 30, 0, 10).toISOString();
    const entries = fromLists([[{ id: 'v1', marked_at: added }]], new Map());
    expect(inRange(entries, 'all', now)).toHaveLength(1);
    expect(inRange(entries, '12m', now)).toHaveLength(1);
    expect(bounds('all', now).to).toBe('2026-10-30');
  });

  it('bounds a range, ending today', () => {
    expect(bounds('all', today)).toEqual({ from: null, to: '2026-10-29' });
    expect(bounds('12m', today)).toEqual({ from: '2025-10-30', to: '2026-10-29' });
    expect(bounds('2025', today)).toEqual({ from: '2025-01-01', to: '2025-12-31' });
    expect(bounds('2026', today)).toEqual({ from: '2026-01-01', to: '2026-10-29' });
    const e = (at: string) => ({ id: at, at, rating: null });
    expect(inRange([e('2025-10-29'), e('2025-10-30'), e('2026-10-29')], '12m', today)).toHaveLength(
      2,
    );
  });

  it('counts by year or month, keeping the empty ones between', () => {
    expect(buckets(['2023-05-01', '2025-01-02', '2025-03-03'], 'year')).toEqual([
      { key: '2023', count: 1 },
      { key: '2024', count: 0 },
      { key: '2025', count: 2 },
    ]);
    expect(buckets(['2025-11-30', '2026-01-01'], 'month').map(b => b.key)).toEqual([
      '2025-11',
      '2025-12',
      '2026-01',
    ]);
    expect(buckets([], 'year')).toEqual([]);
  });

  it('runs the buckets over the range, a year back at least for all of time', () => {
    const all = buckets(['2026-10-29'], 'month', { from: null, to: '2026-10-29' });
    expect(all.map(b => b.key)).toEqual([
      '2025-11',
      '2025-12',
      ...Array.from({ length: 10 }, (_, i) => `2026-${String(i + 1).padStart(2, '0')}`),
    ]);
    expect(all.at(-1)).toEqual({ key: '2026-10', count: 1 });
    const year = buckets(['2024-03-02'], 'month', { from: '2024-01-01', to: '2024-12-31' });
    expect(year.map(b => b.key)).toHaveLength(12);
    expect(buckets(['2020-01-01'], 'year', { from: null, to: '2026-10-29' })).toHaveLength(7);
  });

  it('lays days out a week to a column, Monday first, nothing after the end', () => {
    // 2026-10-29 is a Thursday.
    const weeks = calendar(['2026-10-26', '2026-10-26', '2026-10-29'], '2026-10-29', 2);
    expect(weeks).toHaveLength(2);
    expect(weeks[1][0]).toEqual({ key: '2026-10-26', count: 2 });
    expect(weeks[1][3]).toEqual({ key: '2026-10-29', count: 1 });
    expect(weeks[1][4]).toBeNull();
    expect(weeks[0][0]?.key).toBe('2026-10-19');
    expect(grains('all')).not.toContain('day');
  });

  it('weighs a rating for recommendations, a dislike against', () => {
    expect([1, 2, 3, 4, 5, null].map(weight)).toEqual([-1, 0.25, 1, 1.5, 2, 1]);
  });

  it('finds where the reader parts from vndb, either way', () => {
    const { above, below } = disagreements(
      [
        { id: 'v1', mine: 5, theirs: 60 },
        { id: 'v2', mine: 1, theirs: 85 },
        { id: 'v3', mine: 4, theirs: 80 },
        { id: 'v4', mine: 3, theirs: null },
      ],
      2,
    );
    expect(above.map(d => [d.id, d.by])).toEqual([['v1', 40]]);
    expect(below.map(d => [d.id, d.by])).toEqual([['v2', -65]]);
  });

  it('opens a short span by month', () => {
    const e = (at: string) => ({ id: at, at, rating: null });
    expect(defaultGrain('all', [e('2026-01-01'), e('2025-06-01')])).toBe('month');
    expect(defaultGrain('all', [e('2026-01-01'), e('2023-06-01')])).toBe('year');
    expect(defaultGrain('2025', [])).toBe('month');
  });

  it('narrows by every pick but the chart’s own', () => {
    const entries = [
      { id: 'v1', at: '2026-03-01', rating: 5 },
      { id: 'v2', at: '2026-04-01', rating: 5 },
      { id: 'v3', at: '2025-04-01', rating: 2 },
    ];
    const d = (id: string, released: string) =>
      [id, { id, released, length: 3, olang: 'ja' } as unknown as Detail] as const;
    const details = new Map([d('v1', '2009-01-01'), d('v2', '2012-05-05')]);
    const picks = { added: '2026', released: '2009' };
    expect(narrow(entries, details, picks).map(e => e.id)).toEqual(['v1']);
    expect(narrow(entries, details, picks, 'released').map(e => e.id)).toEqual(['v1', 'v2']);
    expect(narrow(entries, details, { rating: 2 }).map(e => e.id)).toEqual(['v3']);
    // v3 is not fetched yet, so a pick on its own fields cannot place it.
    expect(narrow(entries, details, { length: 3 }).map(e => e.id)).toEqual(['v1', 'v2']);
  });

  it('tallies most first', () => {
    expect(tally(['ja', 'en', 'ja'])).toEqual([
      { value: 'ja', count: 2 },
      { value: 'en', count: 1 },
    ]);
  });
});

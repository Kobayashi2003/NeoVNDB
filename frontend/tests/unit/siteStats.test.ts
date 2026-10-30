import { describe, expect, it } from 'vitest';
import {
  byYear,
  filled,
  median,
  months,
  ofSex,
  stepped,
  summed,
  total,
  years,
} from '@/lib/siteStats';

describe('site stats', () => {
  it('fills the steps of a range nothing was counted in', () => {
    const got = filled([{ key: '110', count: 3 }], 100, 115, 5);
    expect(got.map(c => [c.key, c.value])).toEqual([
      ['100', 0],
      ['105', 0],
      ['110', 3],
      ['115', 0],
    ]);
  });

  it('runs years and months from the first counted to the last', () => {
    expect(
      years([
        { key: '2003', count: 1 },
        { key: '2001', count: 2 },
      ]).map(c => c.key),
    ).toEqual(['2001', '2002', '2003']);
    expect(
      months([
        { key: '2007-11', count: 1 },
        { key: '2008-02', count: 4 },
      ]).map(c => [c.key, c.value]),
    ).toEqual([
      ['2007-11', 1],
      ['2007-12', 0],
      ['2008-01', 0],
      ['2008-02', 4],
    ]);
    expect(years([])).toEqual([]);
    expect(months([])).toEqual([]);
  });

  it('sums months into years', () => {
    expect(
      byYear([
        { key: '2007-11', count: 1 },
        { key: '2007-12', count: 2 },
        { key: '2008-01', count: 4 },
      ]),
    ).toEqual([
      { key: '2007', count: 3 },
      { key: '2008', count: 4 },
    ]);
  });

  it('takes one sex, or adds every sex up, the unknown included', () => {
    const heights = {
      f: [{ key: '150', count: 2 }],
      m: [
        { key: '150', count: 1 },
        { key: '175', count: 3 },
      ],
      u: [{ key: '160', count: 5 }],
    };
    expect(ofSex(heights, 'm')).toEqual(heights.m);
    expect(ofSex({}, 'f')).toEqual([]);
    expect(total(ofSex(heights, 'all'))).toBe(11);
    expect(ofSex(heights, 'all')).toContainEqual({ key: '150', count: 3 });
    expect(summed([heights.f, heights.f])).toEqual([{ key: '150', count: 4 }]);
  });

  it('gathers centimetres into steps and finds the middle', () => {
    const counts = [
      { key: '151', count: 1 },
      { key: '154', count: 1 },
      { key: '158', count: 3 },
    ];
    expect(stepped(counts, 5)).toEqual([
      { key: '150', count: 2 },
      { key: '155', count: 3 },
    ]);
    expect(median(counts)).toBe(158);
    expect(median([])).toBeNull();
    expect(median([{ key: '160', count: 0 }])).toBeNull();
  });

  it('takes the middle by counts, whatever order the keys come in', () => {
    // Half of the four sit at 150 or below: that is the middle.
    expect(
      median([
        { key: '170', count: 2 },
        { key: '150', count: 1 },
        { key: '140', count: 1 },
      ]),
    ).toBe(150);
  });

  it('keys a step by its floor, and makes nothing of nothing', () => {
    expect(stepped([{ key: '9', count: 1 }], 5)).toEqual([{ key: '5', count: 1 }]);
    expect(stepped([], 5)).toEqual([]);
    expect(filled([], 3, 1)).toEqual([]);
  });

  it('runs months across a year without a gap or an extra', () => {
    expect(months([{ key: '2019-12', count: 1 }]).map(c => c.key)).toEqual(['2019-12']);
    expect(
      months([
        { key: '2020-01', count: 1 },
        { key: '2019-11', count: 1 },
      ]).map(c => c.key),
    ).toEqual(['2019-11', '2019-12', '2020-01']);
  });
});

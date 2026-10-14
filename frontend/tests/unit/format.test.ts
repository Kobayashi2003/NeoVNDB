import { describe, expect, it } from 'vitest';
import { aspect, birthday, bust, display, length, medium, score } from '@/lib/format';
import { one, withParams } from '@/lib/href';
import { imageURL, thumbnailURL } from '@/lib/images';
import { stepMonth } from '@/lib/months';
import { DEFAULTS, readPrefs } from '@/lib/prefs';

describe('format', () => {
  it('prefers measured play time over the length bucket', () => {
    expect(length(null, null, 0)).toBe('Unknown');
    expect(length(3, null, 0)).toBe('Medium');
    expect(length(3, 90, 1)).toBe('Medium (1h30m from 1 vote)');
    expect(length(null, 120, 5)).toBe('2h from 5 votes');
  });

  it('classes resolutions by aspect', () => {
    expect(aspect('1920x1080')).toBe('169');
    expect(aspect('800x600')).toBe('43');
    expect(aspect('1024x1024')).toBe('custom');
    expect(aspect('0x0')).toBe('custom');
    expect(aspect(null)).toBeNull();
  });

  it("reads the dump's packed values", () => {
    expect(birthday([12, 25])).toBe('25 December');
    expect(birthday([13, 1])).toBeNull();
    expect(bust(88, 'e')).toBe('88 cm (E cup)');
    expect(bust(null, null)).toBeNull();
    expect(score(null)).toBe('—');
  });

  it('pluralises media', () => {
    expect(medium({ medium: 'cd', qty: 2 })).toMatch(/s$/);
    expect(medium({ medium: 'cd', qty: 1 })).not.toMatch(/^1 /);
  });

  it('shows the original script only when asked and present', () => {
    expect(display('Clannad', 'クラナド', true)).toBe('クラナド');
    expect(display('Clannad', 'クラナド', false)).toBe('Clannad');
    expect(display('Clannad', null, true)).toBe('Clannad');
    expect(display(null, null, false)).toBe('');
  });
});

describe('withParams', () => {
  it('changes some keys and keeps the rest', () => {
    expect(withParams('/v', { sort: 'rating', page: '3' }, { page: 4 })).toBe(
      '/v?sort=rating&page=4',
    );
    expect(withParams('/v', { sort: 'rating', page: '3' }, { page: null })).toBe('/v?sort=rating');
    expect(withParams('/v', {}, {})).toBe('/v');
    // A repeated key keeps its first value.
    expect(withParams('/v', { lang: ['en', 'ja'] }, {})).toBe('/v?lang=en');
    expect(one({ lang: ['en', 'ja'] }, 'lang')).toBe('en');
  });
});

describe('stepMonth', () => {
  it('rolls the year over at either end', () => {
    expect(stepMonth(2026, 12, 1)).toEqual({ year: 2027, month: 1 });
    expect(stepMonth(2026, 1, -1)).toEqual({ year: 2025, month: 12 });
    expect(stepMonth(2026, 5, -17)).toEqual({ year: 2024, month: 12 });
  });
});

describe('readPrefs', () => {
  // The cookie is written by the browser, so anything can come back.
  it('falls back field by field', () => {
    expect(readPrefs(undefined)).toEqual(DEFAULTS);
    expect(readPrefs('not json')).toEqual(DEFAULTS);
    expect(readPrefs('{"sexual":"explicit","spoiler":9,"layout":"x"}')).toEqual({
      ...DEFAULTS,
      sexual: 'explicit',
    });
    expect(readPrefs('{"original":true,"spoiler":2}')).toEqual({
      ...DEFAULTS,
      original: true,
      spoiler: 2,
    });
  });
});

describe('image addresses', () => {
  const cover = (width: number) => ({
    url: 'https://t.vndb.org/cv/39/20339.jpg',
    dims: [width, 400] as [number, number],
  });

  it("rewrites vndb's addresses to the mirror", () => {
    expect(imageURL('https://t.vndb.org/cv/39/20339.jpg')).toBe('/imgserve/img/cv/39/20339.jpg');
    expect(imageURL('https://example.org/x.png')).toBe('https://example.org/x.png');
  });

  it("uses vndb's own thumbnails, and the original where vndb made none", () => {
    expect(thumbnailURL(cover(315))).toBe('/imgserve/img/cv.t/39/20339.jpg');
    // No wider than a thumbnail: vndb never made one.
    expect(thumbnailURL(cover(256))).toBe('/imgserve/img/cv/39/20339.jpg');
    expect(thumbnailURL({ url: 'https://t.vndb.org/sf/90/190.jpg', dims: [800, 600] })).toBe(
      '/imgserve/img/st/90/190.jpg',
    );
    // Portraits have no upstream thumbnail.
    expect(thumbnailURL({ url: 'https://t.vndb.org/ch/12/12.jpg', dims: [500, 700] })).toBe(
      '/imgserve/img/ch/12/12.jpg',
    );
  });
});

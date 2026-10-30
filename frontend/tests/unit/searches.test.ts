/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULTS, prefsFrom } from '@/lib/prefs';
import { describe as describeQuery, forgetRecent, queryOf, recent, remember } from '@/lib/searches';

describe('a search as an address', () => {
  it('keeps what narrows and orders a listing, not where in it the reader is', () => {
    expect(queryOf({ page: '3', limit: '50', search: 'ever', lang: 'en', sort: 'title' })).toBe(
      'lang=en&search=ever&sort=title',
    );
    expect(queryOf({ page: '2' })).toBe('');
  });

  it('reads the same however the address was built', () => {
    expect(queryOf({ lang: 'en', search: 'ever' })).toBe(queryOf({ search: 'ever', lang: 'en' }));
    expect(queryOf({ lang: ['en', 'ja'], f: '' })).toBe('lang=en');
  });

  it('is described with the words first', () => {
    expect(describeQuery('lang=en%2Cja&search=ever+17')).toBe('“ever 17” · lang=en,ja');
    expect(describeQuery('sort=title')).toBe('sort=title');
  });
});

describe('recent searches', () => {
  beforeEach(() => window.localStorage.clear());

  it('are newest first, once each, and only so many', () => {
    for (let i = 0; i < 10; i++) remember('v', `search=${i}`);
    remember('v', 'search=4');
    const got = recent('v');
    expect(got[0]).toBe('search=4');
    expect(got).toHaveLength(8);
    expect(new Set(got).size).toBe(8);
    expect(recent('c')).toEqual([]);
  });

  it('survive storage holding something else', () => {
    window.localStorage.setItem('neovndb:recent:v', '{"not":"a list"}');
    expect(recent('v')).toEqual([]);
    window.localStorage.setItem('neovndb:recent:v', '["search=a",7]');
    expect(recent('v')).toEqual(['search=a']);
    forgetRecent('v');
    expect(recent('v')).toEqual([]);
  });
});

describe('preferences from an account', () => {
  it('take what another device wrote, field by field', () => {
    expect(prefsFrom(null)).toBe(DEFAULTS);
    expect(prefsFrom('spoiler')).toBe(DEFAULTS);
    // A newer device's field is ignored, and so is one this version dropped
    // (the characters' layout); an unknown value falls back.
    expect(prefsFrom({ spoiler: 2, theme: 'light', layout: 'slider', sexual: 'nsfw' })).toEqual({
      ...DEFAULTS,
      spoiler: 2,
    });
  });
});

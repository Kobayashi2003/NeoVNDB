import { describe, expect, it } from 'vitest';
import {
  byRole,
  byWork,
  characterSpoilerExtent,
  forVN,
  packTraits,
  readSex,
  spoilerExtent,
  unpackTraits,
} from '@/lib/characters';
import { shouldBlur } from '@/lib/content';
import { filtersOf, one, withParams } from '@/lib/href';
import { iconOf } from '@/lib/icons';
import { enumLabel } from '@/lib/enums';
import { imageURL, thumbnailURL } from '@/lib/images';
import { monthName, stepMonth } from '@/lib/months';
import { DEFAULTS, readPrefs } from '@/lib/prefs';
import { allowedTraits, groupTraits } from '@/lib/traits';
import { cn } from '@/lib/utils';
import { publishers } from '@/lib/vn';
import { errorText, UserError } from '@/lib/user';
import { FILTERS } from '@/lib/filters';
import { LIST, readsDown, reverseParam } from '@/lib/list';
import type { Character, CharacterDetail, Release, Trait } from '@/lib/types';

function trait(over: Partial<Trait>): Trait {
  return {
    id: 'i1',
    name: 'Trait',
    translation: null,
    group_name: 'Hair',
    group_translation: null,
    spoiler: 0,
    lie: false,
    ...over,
  };
}

function character(over: Partial<Character>): Character {
  return {
    id: 'c1',
    name: 'Someone',
    original: null,
    role: 'main',
    spoiler: 0,
    sex: 'f',
    spoil_sex: null,
    gender: null,
    spoil_gender: null,
    age: null,
    birthday: null,
    blood_type: null,
    height: null,
    weight: null,
    bust: null,
    waist: null,
    hips: null,
    cup: null,
    description: null,
    instance_of: null,
    instance_of_spoiler: 0,
    aliases: [],
    image: null,
    traits: [],
    seiyuu: [],
    ...over,
  };
}

describe('href', () => {
  it('changes some keys and keeps the rest', () => {
    expect(withParams('/v', { lang: 'en', page: '3' }, { page: null, sort: 'rating' })).toBe(
      '/v?lang=en&sort=rating',
    );
    // A repeated key keeps its first value; an empty one is dropped.
    expect(withParams('/v', { a: ['1', '2'], b: '' }, {})).toBe('/v?a=1');
    expect(withParams('/v', {}, {})).toBe('/v');
  });

  it('reads one value and the filters of an address', () => {
    expect(one({ q: ['a', 'b'] }, 'q')).toBe('a');
    expect(filtersOf({ lang: 'en', page: '2', sort: 'rating', f: 'olang=ja', empty: '' })).toEqual({
      lang: 'en',
      f: 'olang=ja',
    });
  });
});

describe('characters', () => {
  it('reads an apparent sex and whether more is hidden', () => {
    expect(readSex(null, null, 0)).toBeNull();
    expect(readSex('f', 'm', 0)).toMatchObject({ label: 'Female', withheld: true, reveal: null });
    expect(readSex('f', 'm', 2)).toMatchObject({ withheld: false, reveal: 'Male' });
    // "No sex applies" is an answer, not a revelation.
    expect(readSex('f', 'n', 0)).toMatchObject({ withheld: false });
    expect(readSex('o', null, 0, 'GENDER')?.label).toBe('Non-binary');
  });

  it('orders roles the way vndb does, unknown ones last', () => {
    const order = byRole([
      character({ id: 'c1', role: 'side' }),
      character({ id: 'c2', role: 'zzz' }),
      character({ id: 'c3', role: 'main' }),
    ]).map(([role]) => role);
    expect(order).toEqual(['main', 'side', 'zzz']);
  });

  it('keeps only the voice credits for this work', () => {
    const c = character({
      seiyuu: [
        { id: 's1', name: 'A', original: null, note: null, vn: 'v17' },
        { id: 's2', name: 'B', original: null, note: null, vn: 'v4' },
      ],
    });
    expect(forVN([c], 'v17')[0].seiyuu.map(s => s.id)).toEqual(['s1']);
  });

  it('sends a trait shared by a cast once, and gives it back whole', () => {
    const dark = trait({ id: 'i128', name: 'Dark' });
    const cast = [
      character({ id: 'c1', traits: [dark, trait({ id: 'i2', name: 'Tall', lie: true })] }),
      character({ id: 'c2', traits: [{ ...dark, spoiler: 2 }] }),
    ];
    const { characters, book } = packTraits(cast);
    expect(Object.keys(book)).toEqual(['i128', 'i2']);
    expect(characters[0].traits).toEqual([
      ['i128', 0],
      ['i2', 0, 1],
    ]);
    expect(characters[1].traits).toEqual([['i128', 2]]);
    expect(unpackTraits(characters, book)).toEqual(cast);
  });

  it('lists each work once, with the weightiest role and the mildest spoiler', () => {
    const row = (role: string, spoiler: number, release: string | null) => ({
      id: 'v765',
      title: 'x',
      alttitle: null,
      released: '2003',
      role,
      spoiler,
      release,
    });
    // c9859 on v765, as vndb records it: twice primary for two releases, once
    // side for the work as a whole.
    expect(
      byWork([row('primary', 0, 'r6131'), row('primary', 0, 'r6876'), row('side', 0, null)]),
    ).toEqual([
      {
        id: 'v765',
        title: 'x',
        alttitle: null,
        released: '2003',
        role: 'primary',
        spoiler: 0,
        releases: [],
      },
    ]);
    expect(byWork([row('side', 2, 'r1'), row('appears', 1, 'r2')])[0]).toMatchObject({
      role: 'side',
      spoiler: 1,
      releases: ['r1', 'r2'],
    });
  });

  it('counts spoilers, leaving sexual traits to the content level', () => {
    const sexual = trait({ group_name: 'Engages in (Sexual)', spoiler: 2 });
    expect(spoilerExtent([character({ traits: [sexual] })], false)).toEqual({
      minor: false,
      major: false,
    });
    expect(spoilerExtent([character({ traits: [sexual] })], true).major).toBe(true);
    expect(spoilerExtent([character({ description: 'a [Spoiler]b[/spoiler]' })], false).major).toBe(
      true,
    );

    const detail: CharacterDetail = {
      ...character({ sex: 'f', spoil_sex: 'm' }),
      vns: [],
      instances: [],
    };
    expect(characterSpoilerExtent(detail, false)).toEqual({ minor: false, major: true });
  });
});

describe('traits', () => {
  const traits = [
    trait({ id: 'i1', group_name: 'Role' }),
    trait({ id: 'i2', group_name: 'Hair', spoiler: 1 }),
    trait({ id: 'i3', group_name: 'Hair' }),
    trait({ id: 'i4', group_name: 'Subject of (Sexual)' }),
    trait({ id: 'i5', group_name: 'Weird' }),
  ];

  it('gates sexual groups behind the content level', () => {
    expect(allowedTraits(traits, false).map(t => t.id)).not.toContain('i4');
    expect(allowedTraits(traits, true)).toHaveLength(5);
  });

  it('groups in vndb order and counts what the spoiler level hides', () => {
    const g = groupTraits(traits, 0, false);
    expect(g.groups.map(([name]) => name)).toEqual(['Hair', 'Role', 'Weird']);
    expect(g.groups[0][1].map(t => t.id)).toEqual(['i3']);
    expect(g.hiddenMinor).toBe(1);
    expect(groupTraits(traits, 1, false).hiddenMinor).toBe(0);
  });
});

describe('content', () => {
  it('blurs past the reader level, and treats an unvoted image as the worst', () => {
    expect(shouldBlur(0, 0, 'safe', 'tame')).toBe(false);
    expect(shouldBlur(1, 0, 'safe', 'tame')).toBe(true);
    expect(shouldBlur(1, 0, 'suggestive', 'tame')).toBe(false);
    expect(shouldBlur(0, 1.6, 'explicit', 'violent')).toBe(true);
    expect(shouldBlur(null, null, 'explicit', 'brutal')).toBe(false);
    expect(shouldBlur(null, 0, 'suggestive', 'brutal')).toBe(true);
  });
});

describe('images', () => {
  const cover = 'https://t.vndb.org/cv/17/117.jpg';
  it("rewrites vndb's addresses to the mirror and leaves others alone", () => {
    expect(imageURL(cover)).toBe('/imgserve/img/cv/17/117.jpg');
    expect(imageURL('https://example.org/a.jpg')).toBe('https://example.org/a.jpg');
  });
  it("takes vndb's own thumbnail when there is one", () => {
    expect(thumbnailURL({ url: cover, dims: [600, 800] })).toBe('/imgserve/img/cv.t/17/117.jpg');
    expect(thumbnailURL({ url: cover, dims: [256, 360] })).toBe('/imgserve/img/cv/17/117.jpg');
    expect(thumbnailURL({ url: 'https://t.vndb.org/sf/1/2.jpg', dims: [1280, 720] })).toBe(
      '/imgserve/img/st/1/2.jpg',
    );
  });
});

describe('months', () => {
  it('names months and steps across years', () => {
    expect(monthName(1)).toBe('January');
    expect(monthName(13)).toBe('');
    expect(stepMonth(2026, 12, 1)).toEqual({ year: 2027, month: 1 });
    expect(stepMonth(2026, 1, -1)).toEqual({ year: 2025, month: 12 });
    expect(stepMonth(2026, 5, -17)).toEqual({ year: 2024, month: 12 });
  });
});

describe('prefs', () => {
  it('falls back field by field', () => {
    expect(readPrefs(undefined)).toBe(DEFAULTS);
    expect(readPrefs('not json')).toBe(DEFAULTS);
    const p = readPrefs(JSON.stringify({ sexual: 'explicit', spoiler: 7, graphYears: 'yes' }));
    expect(p.sexual).toBe('explicit');
    expect(p.spoiler).toBe(DEFAULTS.spoiler);
    expect(p.graphYears).toBe(DEFAULTS.graphYears);
  });
});

describe('labels and icons', () => {
  it('maps codes and leaves unknown ones', () => {
    expect(iconOf('CHARACTER_SEX', 'm')).toBe('icon-char-m');
    expect(iconOf('PLATFORM', 'nope')).toBe('');
    expect(enumLabel('RTYPE', 'trial')).toBe('Trial');
  });

  it('offers a filter menu only for filters the list type knows about', () => {
    for (const [type, filters] of Object.entries(FILTERS)) {
      expect(LIST[type], type).toBeDefined();
      for (const f of filters) expect(f.choices.length, `${type} ${f.key}`).toBeGreaterThan(0);
    }
  });

  it('merges classes with the later one winning', () => {
    expect(cn('px-2 text-sm', false, 'px-4')).toBe('text-sm px-4');
  });
});

describe('vn', () => {
  it('gathers publishers from official releases, first seen first', () => {
    const release = (official: boolean, ids: string[]) =>
      ({
        official,
        producers: ids.map(id => ({
          id,
          name: id,
          original: null,
          developer: false,
          publisher: true,
        })),
      }) as unknown as Release;
    const got = publishers([
      release(true, ['p2', 'p1']),
      release(false, ['p9']),
      release(true, ['p1', 'p3']),
    ]);
    expect(got.map(p => p.id)).toEqual(['p2', 'p1', 'p3']);
  });
});

describe('user', () => {
  it("shows the service's own words, or a generic line", () => {
    expect(errorText(new UserError(409, 'Taken.'))).toBe('Taken.');
    expect(errorText(new Error('boom'))).toBe('Something went wrong.');
  });
});

describe('sort direction', () => {
  const sorts = LIST.v.sorts;

  it('reads each sort its own way unless the address says otherwise', () => {
    expect(readsDown(sorts, 'title')).toBe(false);
    expect(readsDown(sorts, 'rating')).toBe(true);
    // Not offered as a sort, but a search is ordered best match first.
    expect(readsDown(sorts, 'searchrank')).toBe(true);
  });

  it('spells out only the way that is not the default, false included', () => {
    expect(reverseParam(sorts, 'rating', true)).toBeNull();
    expect(reverseParam(sorts, 'rating', false)).toBe('false');
    expect(reverseParam(sorts, 'title', true)).toBe('true');
    expect(reverseParam(sorts, 'searchrank', false)).toBe('false');
  });
});

import { describe, expect, it } from 'vitest';
import {
  complete,
  group,
  leaf,
  negate,
  parse,
  print,
  switchAt,
  tidy,
  type TidyRules,
} from '@/lib/expr';

describe('parse and print', () => {
  // The backend's grammar: , or, + and, ! not, () group, "..." quoting.
  it.each([
    ['lang=en', 'lang=en'],
    ['lang=en,lang=ja', 'lang=en,lang=ja'],
    ['a=1+b=2,c=3+d=4', 'a=1+b=2,c=3+d=4'],
    ['(a=1,b=2)+c=3', '(a=1,b=2)+c=3'],
    ['!patch=true', 'patch!=true'],
    ['!(a=1,b=2)', '!(a=1,b=2)'],
    ['!a=1+b=2', 'a!=1+b=2'],
    // A comparison keeps its negation: !a>="1,2" is not a<"1,2", and some
    // filters take >= and never <.
    ['!rating>=70', '!(rating>=70)'],
    ['!resolution>=1920x1080', '!(resolution>=1920x1080)'],
    [' lang = en , lang = ja ', 'lang=en,lang=ja'],
    ['search="ever, out"', 'search="ever, out"'],
    ['search="say \\"no\\""', 'search="say \\"no\\""'],
    ['release=(vn=(lang=en))', 'release=(vn=(lang=en))'],
    ['!release=(lang=en)', 'release!=(lang=en)'],
    ['producer=(search="a)b")', 'producer=(search="a)b")'],
    ['lang="en,fr"', 'lang="en,fr"'],
    ['tag=g749:2.0:1', 'tag=g749:2.0:1'],
    ['((a=1))', 'a=1'],
    ['a=1+(b=2+c=3)', 'a=1+b=2+c=3'],
  ])('%s', (input, want) => {
    const printed = print(parse(input));
    expect(printed).toBe(want);
    // Printing is a fixed point.
    expect(print(parse(printed))).toBe(printed);
  });

  it.each([
    'lang',
    'lang=',
    '=en',
    '(lang=en',
    'lang=en)',
    'lang=en+',
    'release=(',
    'release=()',
    'a="x',
    'lang=en,fr',
  ])('refuses %s', input => {
    expect(() => parse(input)).toThrow();
  });

  it('refuses a tree nested past the guard', () => {
    expect(() => parse('('.repeat(200) + 'a=1' + ')'.repeat(200))).toThrow();
  });

  // A group of one, all its other parts unfinished, prints where it stands:
  // an or inside it keeps its brackets under an and.
  it('keeps the brackets of an or inside a group of one', () => {
    const inner = group(false, [leaf('x', '=', '1'), leaf('y', '=', '2')]);
    const g = group(true, [leaf('z', '=', '1'), group(false, [inner, leaf()])]);
    expect(print(g)).toBe('z=1+(x=1,y=2)');
  });

  it('leaves unfinished conditions out', () => {
    const g = group(true, [leaf('lang', '=', 'en'), leaf('', '=', ''), leaf('olang', '=', ' ')]);
    expect(print(g)).toBe('lang=en');
    expect(complete(group(true, [leaf()]))).toBe(false);
  });
});

describe('negate', () => {
  it("flips = and != in place, and a group's flag", () => {
    expect(negate(leaf('a', '=', '1'))).toMatchObject({ op: '!=' });
    expect(negate(group(true, [], false))).toMatchObject({ not: true });
  });

  it('keeps a comparison as it is, inside a negated group', () => {
    expect(negate(leaf('a', '>=', '1'))).toMatchObject({
      kind: 'group',
      not: true,
      items: [{ kind: 'leaf', op: '>=' }],
    });
  });
});

describe('tidy', () => {
  // A stand-in for TIDY_RULES, so the algorithm is tested apart from the catalog.
  const listable = ['lang', 'platform', 'rating', 'developer'];
  const rules: TidyRules = {
    mergeable: (_type, name) => listable.includes(name),
    nested: (type, name) => (type === 'v' && name === 'release' ? 'r' : undefined),
  };
  const t = (s: string) => print(tidy(parse(s), 'v', rules));

  it.each([
    ['lang=en,lang=fr', 'lang="en,fr"'],
    ['lang!=en+lang!=fr', 'lang!="en,fr"'],
    ['lang=en+lang=fr', 'lang=en+lang=fr'], // all-of must not merge
    ['rating>=80,rating>=90', 'rating>=80,rating>=90'], // comparisons must not merge
    ['search=a,search=b', 'search=a,search=b'], // not a list filter
    ['!(lang=en)', 'lang!=en'],
    ['!(!(lang=en))', 'lang=en'],
    ['lang=en+lang=en', 'lang=en'],
    ['lang="en,fr",lang=fr,lang=de', 'lang="en,fr,de"'],
    ['release=(lang=en,lang=fr)+developer=p1', 'release=(lang="en,fr")+developer=p1'],
    ['developer=p1,developer=p2,rating>=80', 'developer="p1,p2",rating>=80'],
    ['(lang=en+platform=win),(lang=en+platform=win)', 'lang=en+platform=win'],
  ])('%s', (input, want) => {
    expect(t(input)).toBe(want);
    expect(t(want)).toBe(want); // idempotent
  });
});

describe('switchAt', () => {
  const s = (input: string, i: number) => print(switchAt(parse(input), i));

  it.each([
    ['a=1+b=2+c=3', 2, 'a=1+b=2,c=3'],
    ['a=1+b=2+c=3', 1, 'a=1,b=2+c=3'],
    ['a=1,b=2,c=3', 2, 'a=1,b=2+c=3'],
    ['a=1,b=2,c=3', 1, 'a=1+b=2,c=3'],
    ['a=1+b=2', 1, 'a=1,b=2'],
    ['a=1,b=2', 1, 'a=1+b=2'],
  ])('%s at %i', (input, i, want) => {
    expect(s(input, i)).toBe(want);
  });
});

/** `sex`/`gender` are apparent; `spoil_*` are what they turn out to be, shown
 *  only at spoiler level 2 but always hinted at so the reader knows to ask. */

import { enumLabel } from './enums';
import { allowedTraits } from './traits';
import type { Appearance, Character, CharacterDetail, Trait } from './types';

export interface SexReading {
  /** Always the apparent code. */
  code: string;
  label: string;
  reveal: string | null;
  withheld: boolean;
}

/** `n` is "no sex applies", which is an answer rather than a revelation. */
function spoils(value: string | null, apparent: string): boolean {
  return !!value && value !== apparent && value !== 'n';
}

/** Used for both axes, each with its own codes: sex, or gender with "GENDER". */
export function readSex(
  apparent: string | null,
  spoiler: string | null,
  spoilerLevel: number,
  labels: 'CHARACTER_SEX' | 'GENDER' = 'CHARACTER_SEX',
): SexReading | null {
  if (!apparent) return null;
  const hidden = spoils(spoiler, apparent);
  return {
    code: apparent,
    label: enumLabel(labels, apparent),
    reveal: hidden && spoilerLevel >= 2 ? enumLabel(labels, spoiler!) : null,
    withheld: hidden && spoilerLevel < 2,
  };
}

/** A description's [spoiler] passages count as major: that is the level at
 *  which they show (components/ui/Spoiler). */
function hasSpoilerMarkup(text: string | null | undefined): boolean {
  return !!text && /\[spoiler\]/i.test(text);
}

/** Whether anything is hidden at each spoiler level, counting spoiler traits.
 *  Sexual traits are left out: they are gated by the content level instead. */
export function spoilerExtent(
  characters: Character[],
  explicit: boolean,
): { minor: boolean; major: boolean } {
  let minor = false;
  let major = false;
  for (const c of characters) {
    if (c.spoiler === 1) minor = true;
    if (c.spoiler === 2 || hasSpoilerMarkup(c.description)) major = true;
    for (const t of allowedTraits(c.traits, explicit)) {
      if (t.spoiler === 1) minor = true;
      if (t.spoiler === 2) major = true;
    }
    if (minor && major) break;
  }
  return { minor, major };
}

/** Unknown roles sort after these, alphabetically. */
export const ROLE_ORDER = ['main', 'primary', 'side', 'appears'];

export function byRole(characters: Character[]): [string, Character[]][] {
  const groups = new Map<string, Character[]>();
  for (const c of characters) {
    groups.set(c.role, [...(groups.get(c.role) ?? []), c]);
  }
  const known = ROLE_ORDER.filter(r => groups.has(r));
  const rest = [...groups.keys()].filter(r => !ROLE_ORDER.includes(r)).sort();
  return [...known, ...rest].map(r => [r, groups.get(r)!]);
}

/** Narrows voice credits to this VN; a character carries credits from every
 *  work they appear in. */
export function forVN(characters: Character[], vnId: string): Character[] {
  return characters.map(c => ({
    ...c,
    seiyuu: c.seiyuu.filter(s => s.vn === vnId),
  }));
}

/** A trait as one character holds it: id, spoiler level and whether it is a
 *  lie, as a tuple since a cast holds a thousand or more. The rest is the
 *  trait's own, the same for every character, and goes once in a `TraitBook`. */
export type HeldTrait = [id: string, spoiler: number, lie?: 1];
export type TraitBook = Record<string, Omit<Trait, 'id' | 'spoiler' | 'lie'>>;
export type Packed<C extends { traits: Trait[] }> = Omit<C, 'traits'> & { traits: HeldTrait[] };

/** Takes each trait's name, group and translations out of the characters and
 *  into one book, for handing a cast from the server to the browser: a cast
 *  repeats them, and v11's 31 characters carried 212 KB of them, most of the
 *  page's data. */
export function packTraits<C extends { traits: Trait[] }>(
  characters: C[],
): { characters: Packed<C>[]; book: TraitBook } {
  const book: TraitBook = {};
  const packed = characters.map(c => ({
    ...c,
    traits: c.traits.map(({ id, spoiler, lie, ...own }): HeldTrait => {
      book[id] ??= own;
      return lie ? [id, spoiler, 1] : [id, spoiler];
    }),
  }));
  return { characters: packed, book };
}

export function unpackTraits<C extends { traits: Trait[] }>(
  characters: Packed<C>[],
  book: TraitBook,
): C[] {
  return characters.map(
    c =>
      ({
        ...c,
        traits: c.traits.map(([id, spoiler, lie]) => ({ ...book[id], id, spoiler, lie: !!lie })),
      }) as C,
  );
}

/** One work as a character's page lists it. */
export interface WorkAppearance extends Omit<Appearance, 'release'> {
  /** The releases it is limited to; empty when it is in the work as a whole. */
  releases: string[];
}

/** A character's works, once each. vndb records a character per release, each
 *  time with its own role and spoiler level, so one work can come back several
 *  times: it keeps the weightiest role, the mildest spoiler level (no secret in
 *  a release that shows it openly), and the releases only if every row named
 *  one. */
export function byWork(appearances: Appearance[]): WorkAppearance[] {
  const works = new Map<string, WorkAppearance & { everywhere: boolean }>();
  for (const a of appearances) {
    const seen = works.get(a.id);
    if (!seen) {
      const { release, ...rest } = a;
      works.set(a.id, { ...rest, releases: release ? [release] : [], everywhere: !release });
      continue;
    }
    if (roleRank(a.role) < roleRank(seen.role)) seen.role = a.role;
    seen.spoiler = Math.min(seen.spoiler, a.spoiler);
    if (a.release) seen.releases.push(a.release);
    else seen.everywhere = true;
  }
  return [...works.values()].map(({ everywhere, ...w }) => ({
    ...w,
    releases: everywhere ? [] : w.releases,
  }));
}

/** The work a character's card names: their weightiest role, among works where
 *  appearing is no spoiler. */
export function mainWork<V extends { role: string; spoiler: number }>(vns: V[]): V | null {
  let best: V | null = null;
  for (const v of vns) {
    if (v.spoiler === 0 && (!best || roleRank(v.role) < roleRank(best.role))) best = v;
  }
  return best;
}

/** Where a role sits in ROLE_ORDER; unknown ones after all of them. */
export function roleRank(role: string): number {
  const at = ROLE_ORDER.indexOf(role);
  return at === -1 ? ROLE_ORDER.length : at;
}

/** Spoiler extent for the character page's single control: traits, vns,
 *  instances, aliases and spoiled sex/gender. */
export function characterSpoilerExtent(
  character: CharacterDetail,
  explicit: boolean,
): { minor: boolean; major: boolean } {
  const levels: number[] = [
    ...allowedTraits(character.traits, explicit).map(t => t.spoiler),
    ...byWork(character.vns).map(v => v.spoiler),
    ...character.instances.map(i => i.spoiler),
    ...character.aliases.map(a => a.spoiler),
  ];
  // The dump has no level for a spoiled sex/gender; treat it as major.
  const hidden = (apparent: string | null, spoiler: string | null) =>
    !!apparent && !!spoiler && spoiler !== apparent && spoiler !== 'n';
  if (
    hasSpoilerMarkup(character.description) ||
    hidden(character.sex, character.spoil_sex) ||
    hidden(character.gender, character.spoil_gender) ||
    character.instance_of_spoiler === 2
  ) {
    levels.push(2);
  }
  if (character.instance_of_spoiler === 1) levels.push(1);

  return { minor: levels.includes(1), major: levels.includes(2) };
}

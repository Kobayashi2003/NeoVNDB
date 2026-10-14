/** `sex`/`gender` are apparent; `spoil_*` are what they turn out to be, shown
 *  only at spoiler level 2 but always hinted at so the reader knows to ask. */

import { enumLabel } from './enums';
import { allowedTraits } from './traits';
import type { Character, CharacterDetail } from './types';

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

/** Spoiler extent for the character page's single control: traits, vns,
 *  instances, aliases and spoiled sex/gender. */
export function characterSpoilerExtent(
  character: CharacterDetail,
  explicit: boolean,
): { minor: boolean; major: boolean } {
  const levels: number[] = [
    ...allowedTraits(character.traits, explicit).map(t => t.spoiler),
    ...character.vns.map(v => v.spoiler),
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

/** Reading a character's sex and gender, which the dump deliberately splits.
 *
 *  `sex` is what a character appears to be and `spoil_sex` what they turn out
 *  to be; `gender` is the separate self-identification axis, spoiled the same
 *  way. The second half of each pair is stored apart precisely because
 *  revealing it spoils the first, so it is shown only at a spoiler level that
 *  asked for it -- while the fact that something is there is always hinted at,
 *  since a reader who sees nothing cannot know to ask. */

import { enumLabel } from "./enums"
import { allowedTraits } from "./traits"
import type { Character, CharacterDetail } from "./types"

export interface SexReading {
  /** The code the icon is drawn from, which is always the apparent one. */
  code: string
  label: string
  /** The label behind the spoiler, once the level allows it. */
  reveal: string | null
  /** True when something is behind the spoiler that the level still hides. */
  withheld: boolean
}

/** `n` is "no sex applies", which is an answer rather than a revelation. */
function spoils(value: string | null, apparent: string): boolean {
  return !!value && value !== apparent && value !== "n"
}

/** Both axes share vndb's sex codes, so both read through here. */
export function readSex(
  apparent: string | null,
  spoiler: string | null,
  spoilerLevel: number,
): SexReading | null {
  if (!apparent) return null
  const hidden = spoils(spoiler, apparent)
  return {
    code: apparent,
    label: enumLabel("CHARACTER_SEX", apparent),
    reveal: hidden && spoilerLevel >= 2 ? enumLabel("CHARACTER_SEX", spoiler!) : null,
    withheld: hidden && spoilerLevel < 2,
  }
}

/** Whether a set of characters hides anything at each spoiler level.
 *
 *  A character can be a spoiler in their own right, and an ordinary character
 *  can carry spoiler traits; a control that offered to reveal only the first
 *  would leave the second silently withheld. Sexual traits are excluded here
 *  for the same reason they are excluded from the cards -- they are gated by
 *  the content level, and revealing spoilers must not smuggle them in. */
export function spoilerExtent(
  characters: Character[],
  explicit: boolean,
): { minor: boolean; major: boolean } {
  let minor = false
  let major = false
  for (const c of characters) {
    if (c.spoiler === 1) minor = true
    if (c.spoiler === 2) major = true
    for (const t of allowedTraits(c.traits, explicit)) {
      if (t.spoiler === 1) minor = true
      if (t.spoiler === 2) major = true
    }
    if (minor && major) break
  }
  return { minor, major }
}

/** vndb's role order, most to least important. A role outside it sorts after,
 *  alphabetically, rather than disappearing. */
export const ROLE_ORDER = ["main", "primary", "side", "appears"]

/** Bucket characters by their role in this visual novel, in that order. */
export function byRole(characters: Character[]): [string, Character[]][] {
  const groups = new Map<string, Character[]>()
  for (const c of characters) {
    groups.set(c.role, [...(groups.get(c.role) ?? []), c])
  }
  const known = ROLE_ORDER.filter((r) => groups.has(r))
  const rest = [...groups.keys()].filter((r) => !ROLE_ORDER.includes(r)).sort()
  return [...known, ...rest].map((r) => [r, groups.get(r)!])
}

/** The characters of one visual novel, with each one's voice credits narrowed
 *  to that novel.
 *
 *  A character carries the credits from every work they appear in, because
 *  vndb records a voice role against the three of (work, character, actor) --
 *  so the list that arrives with a character includes actors who never voiced
 *  them here. Narrowing is the page's job, since only the page knows which
 *  work is being read. */
export function forVN(characters: Character[], vnId: string): Character[] {
  return characters.map((c) => ({
    ...c,
    seiyuu: c.seiyuu.filter((s) => s.vn === vnId),
  }))
}

/** Everything a character page can hold back, at each spoiler level.
 *
 *  Five things on that page carry a level of their own: the traits, the works
 *  the character appears in, the instance links, the aliases, and the sex or
 *  gender they turn out to have. One control governs all of them, so it has to
 *  know about all of them -- offering to reveal nothing, or staying hidden
 *  while something is withheld, would both be lies. */
export function characterSpoilerExtent(
  character: CharacterDetail,
  explicit: boolean,
): { minor: boolean; major: boolean } {
  const levels: number[] = [
    ...allowedTraits(character.traits, explicit).map((t) => t.spoiler),
    ...character.vns.map((v) => v.spoiler),
    ...character.instances.map((i) => i.spoiler),
    ...character.aliases.map((a) => a.spoiler),
  ]
  // A sex or gender that turns out to be something else is a major spoiler --
  // the dump has no level for it, only the fact that it differs.
  const hidden = (apparent: string | null, spoiler: string | null) =>
    !!apparent && !!spoiler && spoiler !== apparent && spoiler !== "n"
  if (
    hidden(character.sex, character.spoil_sex) ||
    hidden(character.gender, character.spoil_gender) ||
    character.instance_of_spoiler === 2
  ) {
    levels.push(2)
  }
  if (character.instance_of_spoiler === 1) levels.push(1)

  return { minor: levels.includes(1), major: levels.includes(2) }
}

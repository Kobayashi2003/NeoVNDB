/** What each listing offers to narrow by.
 *
 *  Every key here is a filter the API already understands, and the API
 *  understands more than this: `/v?votecount=>=100` works whether or not
 *  anything on the page offers it. What this table decides is only which ones
 *  get a control, and a control is worth having where a reader would not
 *  otherwise guess the value -- nobody types `platform=tdo` from memory.
 *
 *  The API reads a comma-separated value as "any of these", so a filter that
 *  is `multiple` is one where that reading makes sense. Two different filters
 *  are always ANDed together, which is what a reader expects of two controls.
 */

import { ENUMS, enumLabel } from "./enums"
import { ICON } from "./icons"

export interface Choice {
  value: string
  label: string
  /** A sprite class, for the two dictionaries that have one. */
  icon?: string
}

export interface Filter {
  /** The API parameter. */
  key: string
  label: string
  choices: Choice[]
  /** Several at once, joined by commas, which the API reads as "any of". */
  multiple?: boolean
}

/** Turn one of the enum dictionaries into choices, in its own order. */
function from(group: keyof typeof ENUMS, icons?: Record<string, string>): Choice[] {
  return Object.keys(ENUMS[group]).map((value) => ({
    value,
    label: enumLabel(group, value),
    icon: icons?.[value],
  }))
}

const LANGUAGES = () => from("LANGUAGE", ICON.LANGUAGE as Record<string, string>)
const PLATFORMS = () => from("PLATFORM", ICON.PLATFORM as Record<string, string>)

/** A yes/no the API spells as a `has_*` parameter. */
function yesNo(key: string, label: string): Filter {
  return {
    key,
    label,
    choices: [
      { value: "true", label: "Yes" },
      { value: "false", label: "No" },
    ],
  }
}

export const FILTERS: Record<string, Filter[]> = {
  v: [
    { key: "lang", label: "Language", choices: LANGUAGES(), multiple: true },
    { key: "platform", label: "Platform", choices: PLATFORMS(), multiple: true },
    { key: "length", label: "Length", choices: from("LENGTH"), multiple: true },
    { key: "devstatus", label: "Status", choices: from("DEVSTATUS"), multiple: true },
    // Ratings are spoken about as 10-100, and the API takes a comparison, so
    // these are thresholds rather than buckets.
    {
      key: "rating",
      label: "Rating",
      choices: [80, 70, 60].map((n) => ({ value: `>=${n}`, label: `${n} and up` })),
    },
    yesNo("has_screenshot", "Screenshots"),
    yesNo("has_anime", "Anime"),
  ],
  c: [
    { key: "sex", label: "Sex", choices: from("CHARACTER_SEX"), multiple: true },
    { key: "role", label: "Role", choices: from("CHARACTER_ROLE"), multiple: true },
  ],
  r: [
    { key: "lang", label: "Language", choices: LANGUAGES(), multiple: true },
    { key: "platform", label: "Platform", choices: PLATFORMS(), multiple: true },
    { key: "medium", label: "Medium", choices: from("MEDIUM"), multiple: true },
    { key: "voiced", label: "Voiced", choices: from("VOICED"), multiple: true },
    yesNo("official", "Official"),
    yesNo("patch", "Patch"),
    yesNo("freeware", "Freeware"),
  ],
  p: [
    { key: "type", label: "Type", choices: from("TYPE"), multiple: true },
    { key: "lang", label: "Language", choices: LANGUAGES(), multiple: true },
  ],
  s: [
    { key: "lang", label: "Language", choices: LANGUAGES(), multiple: true },
    { key: "gender", label: "Gender", choices: from("CHARACTER_SEX"), multiple: true },
  ],
  g: [{ key: "category", label: "Category", choices: from("CATEGORY"), multiple: true }],
  i: [],
}

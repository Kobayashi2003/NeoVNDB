/** The filter bar's quick menus per type; everything else is in the condition
 *  builder (lib/conditions.ts). A `multiple` filter joins values with commas,
 *  which the API reads as "any of". */

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

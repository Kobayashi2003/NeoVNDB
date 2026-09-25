/** The enum dictionaries as pick lists, shared by the filter bar
 *  (lib/filters.ts) and the condition builder (lib/conditions.ts). */

import { ENUMS, enumLabel } from "./enums"
import { ICON, iconOf } from "./icons"

export interface Choice {
  value: string
  label: string
  /** A sprite class, for the dictionaries that have one. */
  icon?: string
}

/** One dictionary as choices, in its own order, with its sprites if asked. */
export function choices(group: keyof typeof ENUMS, icons?: keyof typeof ICON): Choice[] {
  return Object.keys(ENUMS[group]).map((value) => ({
    value,
    label: enumLabel(group, value),
    icon: icons ? iconOf(icons, value) || undefined : undefined,
  }))
}

export const LANGUAGES = choices("LANGUAGE", "LANGUAGE")
export const PLATFORMS = choices("PLATFORM", "PLATFORM")

/** Staff records only ever say m or f. */
export const STAFF_GENDER = choices("GENDER").filter((c) => c.value === "m" || c.value === "f")

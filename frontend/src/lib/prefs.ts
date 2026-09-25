/** Preferences live in a cookie so the server renders with them; hydrating
 *  them from localStorage caused a 0.17 CLS on VN pages. ~147 bytes sent with
 *  every same-origin request, images included; keep it small. Not httpOnly:
 *  the browser writes it. */

import type { SexualLevel, SpoilerLevel, ViolenceLevel } from "./content"

export type CharacterLayout = "grid" | "slider"

export interface Prefs {
  /** Original script for names; translated text for tags and traits. */
  original: boolean
  sexual: SexualLevel
  violence: ViolenceLevel
  /** Starting level for every section. */
  spoiler: SpoilerLevel
  layout: CharacterLayout
}

export const DEFAULTS: Prefs = {
  original: false,
  sexual: "safe",
  violence: "tame",
  spoiler: 0,
  layout: "grid",
}

export const PREFS_COOKIE = "neovndb.prefs"

/** Written on every change only so other tabs hear of it: cookies fire no event. */
export const PREFS_STORAGE = "neovndb:prefs"

function pick<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback
}

/** Invalid fields fall back to their default individually. */
export function readPrefs(raw: string | undefined | null): Prefs {
  if (!raw) return DEFAULTS
  try {
    const saved = JSON.parse(raw) as Partial<Prefs>
    return {
      original: typeof saved.original === "boolean" ? saved.original : DEFAULTS.original,
      sexual: pick(saved.sexual, ["safe", "suggestive", "explicit"], DEFAULTS.sexual),
      violence: pick(saved.violence, ["tame", "violent", "brutal"], DEFAULTS.violence),
      spoiler: ([0, 1, 2] as const).includes(saved.spoiler as 0 | 1 | 2)
        ? (saved.spoiler as SpoilerLevel)
        : DEFAULTS.spoiler,
      layout: pick(saved.layout, ["grid", "slider"], DEFAULTS.layout),
    }
  } catch {
    return DEFAULTS
  }
}

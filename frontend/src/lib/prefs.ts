/** What the reader has chosen to see, and where it is kept.
 *
 *  In a cookie, not in localStorage, and that is the whole point of this file
 *  being separate: the server has to know the answer before it renders. It
 *  used to guess the defaults and let the real values arrive with hydration,
 *  which meant a reader with "original script" on watched every page rewrite
 *  itself from English into Japanese a second after it appeared -- measured at
 *  0.1676 on a visual novel page, by a distance the largest layout shift on
 *  the site. A cookie rides along with the request that renders the page.
 *
 *  Five short fields, 147 bytes on the wire once the JSON is percent-encoded
 *  -- and it rides along with everything on this origin, images included, so
 *  a page of covers carries it a couple of dozen times. Small enough to be
 *  worth the page rendering correctly the first time; if it ever stops being
 *  so, the fix is a compact encoding rather than a second home for it.
 *
 *  Not httpOnly: the browser half is the half that writes it. */

import type { SexualLevel, SpoilerLevel, ViolenceLevel } from "./content"

/** How the character section lays its cards out. */
export type CharacterLayout = "grid" | "slider"

export interface Prefs {
  /** Show the original script where a romanisation exists, and the translated
   *  name where a tag or trait has one. */
  original: boolean
  sexual: SexualLevel
  violence: ViolenceLevel
  /** Where every section starts. A reader who has finished a work should not
   *  have to reveal it again on every page. */
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

/** The key the first version wrote, read once so that a reader who set these
 *  before the cookie existed keeps what they chose. */
export const PREFS_STORAGE = "neovndb:prefs"

function pick<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback
}

/** Whatever was stored, read as this version understands it. Anything missing,
 *  unknown or corrupt falls back to the default for that one field rather than
 *  throwing the rest away. */
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

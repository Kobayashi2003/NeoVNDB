/** Rendering rules the API leaves to the client. */

import { enumLabel } from "./enums"
import { monthName } from "./months"

/** The API sends TBA for a release with no date and 2002-08 for a partial one;
 *  both pass through as they are. */
export function releaseDate(value: string): string {
  return value || "TBA"
}

/** vndb reports a score out of 100 with one decimal. */
export function score(value: number | null): string {
  return value === null ? "—" : value.toFixed(2)
}

export function length(code: number | null, minutes: number | null, votes: number): string {
  const label = code === null ? null : enumLabel("LENGTH", code)
  if (!minutes) return label ?? "Unknown"
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  const clock = rest ? `${hours}h${rest}m` : `${hours}h`
  const from = votes === 1 ? "1 vote" : `${votes} votes`
  return label ? `${label} (${clock} from ${from})` : `${clock} from ${from}`
}

/** vndb writes the age rating as a heart plus the minimum age, where the heart
 *  says whether there are erotic scenes rather than repeating the age. */
export function ageRating(minage: number | null): string {
  if (minage === null) return "—"
  return minage === 0 ? "All ages" : `${minage}+`
}

/** "1 DVD", "2 CDs" -- what a release row shows for its medium. */
export function medium(m: { medium: string; qty: number }): string {
  const label = enumLabel("MEDIUM", m.medium)
  if (m.qty <= 1) return label
  return `${m.qty} ${label}${label.endsWith("s") ? "" : "s"}`
}

/** Aspect class for the resolution icon; vndb draws 4:3 and 16:9 differently
 *  and falls back to a third icon for anything else. */
export function aspect(resolution: string | null): "43" | "169" | "custom" | null {
  if (!resolution) return null
  const [w, h] = resolution.split("x").map(Number)
  if (!w || !h) return "custom"
  const ratio = w / h
  if (Math.abs(ratio - 4 / 3) < 0.02) return "43"
  if (Math.abs(ratio - 16 / 9) < 0.02) return "169"
  return "custom"
}

/** Sentence describing one animation slot, for an icon's tooltip. */
export function animationLabel(
  slot: { kind: string; frequency?: string | null } | null,
): string | null {
  if (!slot || slot.kind === "unknown") return null
  if (slot.kind === "none") return "Not animated"
  return slot.frequency ? `${slot.kind}, ${slot.frequency}` : slot.kind
}

/** vndb stores the original script and its romanisation side by side, and
 *  shows one of them. `original` is only present when it differs. */
export function display(
  preferred: string | null,
  original: string | null,
  showOriginal: boolean,
): string {
  if (showOriginal && original) return original
  return preferred ?? original ?? ""
}


/** The dump packs a birthday as a month/day pair with no year, which is all
 *  vndb records -- so it reads as a day and a month and nothing else. */
export function birthday(pair: [number, number] | null): string | null {
  if (!pair) return null
  const [month, day] = pair
  const name = monthName(month)
  return name ? `${day} ${name}` : null
}

/** vndb records a bust measurement, a cup size, or both, and shows whichever
 *  it has as one value. */
export function bust(cm: number | null, cup: string | null): string | null {
  const size = cup ? `${cup.toUpperCase()} cup` : null
  if (cm === null) return size
  return size ? `${cm} cm (${size})` : `${cm} cm`
}

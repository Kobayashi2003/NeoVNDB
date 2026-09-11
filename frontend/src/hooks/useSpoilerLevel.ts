/** Spoiler state for one section.
 *
 *  It cycles rather than offering three buttons, and skips a level with
 *  nothing behind it, so the control can say what the next click will actually
 *  reveal. A section with no spoilers at all shows no control. */
"use client"

import { useState } from "react"

export type SpoilerLevel = 0 | 1 | 2

export interface SpoilerControl {
  level: SpoilerLevel
  set: (level: SpoilerLevel) => void
  /** False when there is nothing to reveal, and so nothing to ask about. */
  any: boolean
  cycle: () => void
  /** What the next click does, which is what the control should say. */
  label: string
  tone: "minor" | "major" | "none"
  /** Text classes matching the tone: yellow for minor, orange for major. */
  className: string
}

export function useSpoilerLevel(hasMinor: boolean, hasMajor: boolean): SpoilerControl {
  const [level, set] = useState<SpoilerLevel>(0)

  const next = (): SpoilerLevel => {
    if (level === 0) return hasMinor ? 1 : 2
    if (level === 1) return hasMajor ? 2 : 0
    return 0
  }

  // The severity of what the next click reveals drives both label and colour.
  // At level 0 that is usually minor, but jumps to major when there are no
  // minor spoilers to step through.
  const tone: SpoilerControl["tone"] =
    level === 0 ? (hasMinor ? "minor" : "major") : level === 1 && hasMajor ? "major" : "none"

  return {
    level,
    set,
    any: hasMinor || hasMajor,
    cycle: () => set(next()),
    label:
      tone === "minor" ? "Show minor spoilers"
        : tone === "major" ? "Show major spoilers"
          : "Hide spoilers",
    tone,
    className:
      tone === "minor" ? "text-yellow-400 hover:text-yellow-300"
        : tone === "major" ? "text-orange-400 hover:text-orange-300"
          : "text-muted hover:text-white",
  }
}

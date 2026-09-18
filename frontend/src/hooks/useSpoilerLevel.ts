/** Spoiler state for one section.
 *
 *  It cycles rather than offering three buttons, and skips a level with
 *  nothing behind it, so the control can say what the next click will actually
 *  reveal. A section with no spoilers at all shows no control.
 *
 *  Where it starts is a saved preference, because somebody who has finished a
 *  work was answering the same question on every page they opened. A section
 *  the reader has actually touched keeps their answer for as long as they are
 *  on the page; one they have not follows the preference, so changing it in
 *  the header changes what is in front of them rather than only what comes
 *  next. */
"use client"

import { useState } from "react"
import { usePrefs } from "./usePrefs"
import type { SpoilerLevel } from "@/lib/content"

export type { SpoilerLevel } from "@/lib/content"

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
  const { spoiler } = usePrefs()
  const [touched, set] = useState<SpoilerLevel | null>(null)
  const level = touched ?? spoiler

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

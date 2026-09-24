/** Spoiler state for one section. Cycles through levels, skipping empty
 *  ones, so the control can say what the next click reveals. Starts at the
 *  saved preference; a section the reader touched keeps its own choice for
 *  the page, the rest follow the preference live. */
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

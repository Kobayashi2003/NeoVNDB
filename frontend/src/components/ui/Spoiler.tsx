/** A `[spoiler]`, blurred until shown: a blur shows how much is hidden, where
 *  a blank box reads as a failed image.
 *
 *  Inside a SpoilerScope it follows that page's spoiler control: shown at
 *  "major" (vndb shows them only at its highest level too), hidden below it,
 *  and one clicked open closes again as soon as the control changes -- the
 *  control is the reader's last word on what they want to see. Outside any
 *  scope, a click is the only control there is. */
"use client"

import { createContext, useContext, useState } from "react"
import type { SpoilerLevel } from "@/lib/content"

const Level = createContext<SpoilerLevel | null>(null)

export function SpoilerScope({ level, children }: { level: SpoilerLevel; children: React.ReactNode }) {
  return <Level.Provider value={level}>{children}</Level.Provider>
}

export function Spoiler({ children }: { children: React.ReactNode }) {
  const level = useContext(Level)
  // The level it was opened at: a change of level is a new decision.
  const [openedAt, setOpenedAt] = useState<SpoilerLevel | -1 | null>(null)
  const shown = level === 2 || (openedAt !== null && openedAt === (level ?? -1))
  if (shown) return <span>{children}</span>

  return (
    <button
      type="button"
      onClick={() => setOpenedAt(level ?? -1)}
      title="Spoiler — click to show"
      aria-label="Show spoiler"
      className="select-none rounded border border-yellow-500/25 bg-yellow-500/5 px-1 text-left text-yellow-100/70 blur-[4px] transition-[filter] hover:blur-[3px]"
    >
      {children}
    </button>
  )
}

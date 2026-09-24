/** A `[spoiler]`, blurred until clicked: a blur shows how much is hidden,
 *  where a blank box reads as a failed image. */
"use client"

import { useState } from "react"

export function Spoiler({ children }: { children: React.ReactNode }) {
  const [shown, setShown] = useState(false)
  if (shown) return <span>{children}</span>

  return (
    <button
      type="button"
      onClick={() => setShown(true)}
      title="Spoiler — click to show"
      aria-label="Show spoiler"
      className="select-none rounded border border-yellow-500/25 bg-yellow-500/5 px-1 text-left text-yellow-100/70 blur-[4px] transition-[filter] hover:blur-[3px]"
    >
      {children}
    </button>
  )
}

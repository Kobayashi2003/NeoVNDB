/** Text hidden until clicked, which is what vndb's `[spoiler]` means.
 *
 *  Blurred rather than blanked. A blank block of the right size reads as a
 *  failed image, and it says nothing about what it is; a blur in the same
 *  yellow every other spoiler on this page is drawn in says both what it is
 *  and how much of it there is. */
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

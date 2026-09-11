/** The buttons that reveal what a spoiler level is holding back.
 *
 *  They sit where the hidden things would have been rather than at the top of
 *  a section, so a reader sees both how much is missing and exactly where.
 *  Yellow opens the minor level and orange the major one -- the same two
 *  colours every spoiler on the page is drawn in.
 *
 *  Rendered without a wrapper: some callers put these at the end of a row of
 *  pills and some below a block, and the one that decides the layout should be
 *  the one that owns it. */
"use client"

import { cn } from "@/lib/utils"
import type { SpoilerLevel } from "@/hooks/useSpoilerLevel"

export function SpoilerReveals({
  minor,
  major,
  noun,
  className,
  onReveal,
}: {
  minor: number
  major: number
  /** What is hidden, e.g. "trait". Omitted, it reads "+3 minor spoilers". */
  noun?: string
  className?: string
  onReveal: (level: SpoilerLevel) => void
}) {
  const label = (count: number, tone: string) =>
    noun
      ? `+${count} ${tone} spoiler ${count === 1 ? noun : `${noun}s`}`
      : `+${count} ${tone} spoiler${count === 1 ? "" : "s"}`

  return (
    <>
      {minor > 0 && (
        <button
          type="button"
          onClick={() => onReveal(1)}
          className={cn(
            "inline-flex items-center rounded-full border border-yellow-500/20 bg-yellow-500/10 px-2.5 py-0.5 text-xs text-yellow-400 transition-colors hover:bg-yellow-500/20",
            className,
          )}
        >
          {label(minor, "minor")}
        </button>
      )}
      {major > 0 && (
        <button
          type="button"
          onClick={() => onReveal(2)}
          className={cn(
            "inline-flex items-center rounded-full border border-orange-500/20 bg-orange-500/10 px-2.5 py-0.5 text-xs text-orange-400 transition-colors hover:bg-orange-500/20",
            className,
          )}
        >
          {label(major, "major")}
        </button>
      )}
    </>
  )
}

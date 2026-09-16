/** The word in front of a row of controls: "Sort", "Filter", "Show".
 *
 *  It used to be set exactly like the controls it introduces -- same size,
 *  same colour as an unselected one -- so "Sort  Name  Age  Height" read as
 *  four things to choose from, and the first one did nothing when clicked.
 *
 *  Uppercase and letter-spaced is the difference, because no control here is
 *  ever set that way; it is the same treatment the cards use for their own
 *  headings, so a label looks like a label wherever it appears. */

import { cn } from "@/lib/utils"

export function ControlLabel({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <span
      className={cn(
        "mr-1 shrink-0 text-[0.625rem] font-semibold uppercase tracking-wider text-muted/70",
        className,
      )}
    >
      {children}
    </span>
  )
}

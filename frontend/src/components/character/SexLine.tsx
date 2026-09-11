/** A character's sex, and the fact that it may not be the whole answer.
 *
 *  Shared by the tile and the card so both spell the spoiler the same way: a
 *  dim `(?)` while the level withholds the rest, and an arrow to the other
 *  answer once it does not. */

import { cn } from "@/lib/utils"
import { Icon } from "@/components/ui/Icon"
import type { SexReading } from "@/lib/characters"

export function SexLine({
  reading,
  icon,
  className,
}: {
  reading: SexReading
  icon: string
  className?: string
}) {
  return (
    <span className={cn("flex items-center gap-1.5", className)}>
      {icon && <Icon cls={icon} title={reading.label} />}
      <span className="truncate">
        {reading.label}
        {reading.withheld && (
          <span className="text-yellow-500/70" title="Something here is a spoiler">
            {" "}
            (?)
          </span>
        )}
        {reading.reveal && <span className="text-yellow-400"> &rarr; {reading.reveal}</span>}
      </span>
    </span>
  )
}

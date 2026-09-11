/** One sprite icon with a tooltip. The sprite and its class names come from
 *  vndb, so a reader who knows that site recognises the row on sight. */

import { cn } from "@/lib/utils"
import { Tooltip } from "./Tooltip"

export function Icon({
  cls,
  title,
  className,
}: {
  /** A sprite class, e.g. `icon-plat-win` or `icon-rel-free`. */
  cls: string
  /** Shown on hover, and read out in place of the icon. */
  title: string
  className?: string
}) {
  return (
    <Tooltip label={title}>
      <span className={cn(cls, className)} role="img" aria-label={title} />
    </Tooltip>
  )
}

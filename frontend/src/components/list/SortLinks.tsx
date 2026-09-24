/** Sort links. Clicking the active sort flips direction; a new sort starts
 *  from its useful end (ratings high first). */

import { ArrowDown, ArrowUp } from "lucide-react"
import Link from "next/link"
import { cn } from "@/lib/utils"
import { ControlLabel } from "@/components/ui/ControlLabel"
import { withParams, type Params } from "@/lib/href"
import type { Sort } from "@/lib/list"

export function SortLinks({
  path,
  params,
  sorts,
  active,
  reverse,
}: {
  path: string
  params: Params
  sorts: Sort[]
  active: string
  reverse: boolean
}) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      <ControlLabel>Sort</ControlLabel>
      {sorts.map((sort) => {
        const here = sort.value === active
        // Changing the page's contents invalidates which page you were on.
        const next = here
          ? { sort: sort.value, reverse: reverse ? null : "true", page: null }
          : { sort: sort.value, reverse: sort.descending ? "true" : null, page: null }

        return (
          <Link
            key={sort.value}
            href={withParams(path, params, next)}
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition-colors",
              here ? "bg-white/20 text-white" : "text-muted hover:bg-white/10 hover:text-white",
            )}
          >
            {sort.label}
            {here &&
              (reverse ? (
                <ArrowDown className="icon-text size-3 text-muted" aria-label="descending" />
              ) : (
                <ArrowUp className="icon-text size-3 text-muted" aria-label="ascending" />
              ))}
          </Link>
        )
      })}
    </div>
  )
}

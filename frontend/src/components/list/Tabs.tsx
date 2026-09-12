/** The relations a detail page can list, as links.
 *
 *  A producer's works and its releases are two different questions about the
 *  same company, and which one is being asked belongs in the address like
 *  everything else here. Switching tabs abandons whatever page and order the
 *  last one was on, because they describe a different list. */

import Link from "next/link"
import { cn } from "@/lib/utils"
import { withParams, type Params } from "@/lib/href"

export interface Tab {
  /** The value of `?tab=`; the first one is also the default and is left out
   *  of the address. */
  value: string
  label: string
  count: number
  /** The result type this tab lists. */
  type: string
  filters: Record<string, string>
}

export function Tabs({
  path,
  params,
  tabs,
  active,
}: {
  path: string
  params: Params
  tabs: Tab[]
  active: string
}) {
  // One tab is not a choice, and a strip of one reads as a broken strip.
  if (tabs.length < 2) return null

  return (
    <div className="flex flex-wrap gap-1" role="tablist">
      {tabs.map((tab, i) => {
        const here = tab.value === active
        const label = (
          <>
            {tab.label}
            <span className="ml-1.5 tabular-nums text-muted">{tab.count.toLocaleString()}</span>
          </>
        )
        const shape = "rounded-full px-3 py-1 text-xs font-medium transition-colors"

        // A tab with nothing behind it is still worth showing -- that this
        // person voiced nobody is an answer -- but it is not worth a click.
        if (tab.count === 0 && !here) {
          return (
            <span key={tab.value} role="tab" aria-selected={false} aria-disabled className={cn(shape, "text-muted/40")}>
              {label}
            </span>
          )
        }

        return (
          <Link
            key={tab.value}
            href={withParams(path, params, {
              tab: i === 0 ? null : tab.value,
              page: null,
              sort: null,
              reverse: null,
            })}
            role="tab"
            aria-selected={here}
            className={cn(
              shape,
              here ? "bg-white/20 text-white" : "text-muted hover:bg-white/10 hover:text-white",
            )}
          >
            {label}
          </Link>
        )
      })}
    </div>
  )
}

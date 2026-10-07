/** A catalogue page's tabs, as links. Switching resets page and sort, since
 *  they belonged to a different list. */

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
  // One tab is not a choice, but it still says what is listed: shown as a
  // label rather than a link.
  if (tabs.length === 1) {
    return (
      <span className="rounded-full bg-white/20 px-3 py-1 text-xs font-medium text-white">
        {tabs[0].label}
        <span className="ml-1.5 tabular-nums text-muted">{tabs[0].count.toLocaleString()}</span>
      </span>
    )
  }

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

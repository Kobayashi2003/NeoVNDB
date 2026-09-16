/** The controls that narrow a listing.
 *
 *  One kind of control for all of them: a button that opens its choices. Seven
 *  types with different filters could have had seven bespoke widgets; a single
 *  vocabulary is less to learn and much less to maintain, and the difference
 *  between picking one language and picking one status is not a difference a
 *  reader needs the interface to dramatise.
 *
 *  Everything a control does is a link, like the sorts and the pages. Which
 *  means a narrowed listing is an address -- the reader can send it to someone,
 *  and the API understands more of that address than this page offers: a
 *  hand-written `?votecount=>=100` survives every click here untouched. */
"use client"

import { useState } from "react"
import Link from "next/link"
import { Check, ChevronDown, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { one, withParams, type Params } from "@/lib/href"
import { useKeptOnScreen } from "@/hooks/useKeptOnScreen"
import { useDismiss } from "@/hooks/useDismiss"
import type { Choice, Filter } from "@/lib/filters"

/** The values of one filter currently in the address. */
function selected(params: Params, key: string): string[] {
  const raw = one(params, key)
  return raw ? raw.split(",").filter(Boolean) : []
}

/** The address with one choice turned on or off. A single-valued filter
 *  replaces, a multiple one adds to or removes from the list. */
function toggled(
  path: string,
  params: Params,
  filter: Filter,
  value: string,
): string {
  const now = selected(params, filter.key)
  const has = now.includes(value)
  const next = filter.multiple
    ? has
      ? now.filter((v) => v !== value)
      : [...now, value]
    : has
      ? []
      : [value]
  // Narrowing changes what the pages contain, so whatever page the reader was
  // on no longer means anything.
  return withParams(path, params, { [filter.key]: next.join(",") || null, page: null })
}

export function FilterBar({
  path,
  params,
  filters,
}: {
  path: string
  params: Params
  filters: Filter[]
}) {
  if (filters.length === 0) return null

  const active = filters.flatMap((f) =>
    selected(params, f.key).map((value) => ({ filter: f, value })),
  )

  return (
    <div className="flex flex-wrap items-center gap-1">
      <span className="mr-1 text-xs text-muted">Filter</span>

      {filters.map((filter) => (
        <FilterMenu
          key={filter.key}
          path={path}
          params={params}
          filter={filter}
          chosen={selected(params, filter.key)}
        />
      ))}

      {/* What is on, said in words, and removable one at a time. A reader
          should not have to reopen a menu to find out what they narrowed by. */}
      {active.map(({ filter, value }) => (
        <Link
          key={`${filter.key}-${value}`}
          href={toggled(path, params, filter, value)}
          className="inline-flex items-center gap-1 rounded-full bg-accent/15 px-2.5 py-1 text-xs text-accent transition-colors hover:bg-accent/25"
        >
          {labelOf(filter, value)}
          <X className="h-3 w-3" aria-hidden />
        </Link>
      ))}

      {active.length > 1 && (
        <Link
          href={withParams(
            path,
            params,
            Object.fromEntries([...filters.map((f) => [f.key, null]), ["page", null]]),
          )}
          className="ml-1 text-xs text-muted transition-colors hover:text-white"
        >
          Clear all
        </Link>
      )}
    </div>
  )
}

function labelOf(filter: Filter, value: string): string {
  return filter.choices.find((c) => c.value === value)?.label ?? value
}

function FilterMenu({
  path,
  params,
  filter,
  chosen,
}: {
  path: string
  params: Params
  filter: Filter
  chosen: string[]
}) {
  const [open, setOpen] = useState(false)
  const box = useDismiss<HTMLDivElement>(open, () => setOpen(false))
  const menu = useKeptOnScreen<HTMLDivElement>(open)

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className={cn(
          "flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium transition-colors",
          chosen.length > 0
            ? "bg-white/20 text-white"
            : "text-muted hover:bg-white/10 hover:text-white",
        )}
      >
        {filter.label}
        {chosen.length > 0 && <span className="tabular-nums text-muted">{chosen.length}</span>}
        <ChevronDown className={cn("h-3 w-3 transition-transform", open && "rotate-180")} aria-hidden />
      </button>

      {open && (
        // Capped and scrolling: there are fifty languages, and a menu that
        // ran off the screen would be worse than one you have to scroll.
        <div
          ref={menu}
          className="absolute left-0 top-full z-30 mt-1 max-h-80 w-56 max-w-[calc(100vw-1rem)] overflow-y-auto overscroll-contain rounded-lg border border-white/10 bg-[var(--overlay)] p-1 shadow-xl"
        >
          {filter.choices.map((choice) => (
            <Option
              key={choice.value}
              href={toggled(path, params, filter, choice.value)}
              choice={choice}
              on={chosen.includes(choice.value)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function Option({ href, choice, on }: { href: string; choice: Choice; on: boolean }) {
  return (
    <Link
      href={href}
      className={cn(
        "flex items-center gap-2 rounded px-2 py-1.5 text-xs transition-colors",
        on ? "text-accent" : "text-white/80 hover:bg-white/10",
      )}
    >
      <Check className={cn("h-3 w-3 shrink-0", !on && "invisible")} aria-hidden />
      {choice.icon && <span className={cn(choice.icon, "shrink-0")} aria-hidden />}
      <span className="truncate">{choice.label}</span>
    </Link>
  )
}

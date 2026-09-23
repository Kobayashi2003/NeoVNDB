/** The controls that narrow a listing: one menu per common filter, plus the
 *  condition builder for anything else. Every control is a link, so a narrowed
 *  listing is an address, and hand-written parameters survive every click. */
"use client"

import { useState } from "react"
import Link from "next/link"
import { ChevronDown, ListFilter, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { ControlLabel } from "@/components/ui/ControlLabel"
import { MenuLabel, MenuMark, MenuPanel, menuAction, menuItem } from "@/components/ui/Menu"
import { one, withParams, type Params } from "@/lib/href"
import { useKeptOnScreen } from "@/hooks/useKeptOnScreen"
import { useDismiss } from "@/hooks/useDismiss"
import type { Choice, Filter } from "@/lib/filters"
import { ConditionBuilder } from "./ConditionBuilder"

/** The values of one filter currently in the address. */
function selected(params: Params, key: string): string[] {
  const raw = one(params, key)
  return raw ? raw.split(",").filter(Boolean) : []
}

/** A single-valued filter replaces; a multiple one toggles within the list. */
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
  return withParams(path, params, { [filter.key]: next.join(",") || null, page: null })
}

export function FilterBar({
  type,
  path,
  params,
  filters,
}: {
  type: string
  path: string
  params: Params
  filters: Filter[]
}) {
  const expression = one(params, "f") ?? ""
  const [building, setBuilding] = useState(expression !== "")

  const active = filters.flatMap((f) =>
    selected(params, f.key).map((value) => ({ filter: f, value })),
  )

  return (
    <div className="flex flex-wrap items-center gap-1">
      <ControlLabel>Filter</ControlLabel>

      {filters.map((filter) => (
        <FilterMenu
          key={filter.key}
          path={path}
          params={params}
          filter={filter}
          chosen={selected(params, filter.key)}
        />
      ))}

      <button
        type="button"
        onClick={() => setBuilding((b) => !b)}
        aria-expanded={building}
        className={cn(
          "flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium transition-colors",
          expression ? "bg-white/20 text-white" : "text-muted hover:bg-white/10 hover:text-white",
        )}
      >
        <ListFilter className="icon-text h-3 w-3" aria-hidden />
        Conditions
        <ChevronDown className={cn("icon-text h-3 w-3 transition-transform", building && "rotate-180")} aria-hidden />
      </button>

      {/* What is on, removable one at a time. */}
      {active.map(({ filter, value }) => (
        <Link
          key={`${filter.key}-${value}`}
          href={toggled(path, params, filter, value)}
          aria-label={`Remove ${filter.label}: ${labelOf(filter, value)}`}
          className="inline-flex items-center gap-1 rounded-full bg-accent/15 px-2.5 py-1 text-xs text-accent transition-colors hover:bg-accent/25"
        >
          {/* Named with its filter: a bare "No" is ambiguous. */}
          <span className="text-accent/60">{filter.label}</span>
          {labelOf(filter, value)}
          <X className="icon-text h-3 w-3" aria-hidden />
        </Link>
      ))}

      {expression && !building && (
        <Link
          href={withParams(path, params, { f: null, page: null })}
          aria-label="Remove conditions"
          title={expression}
          className="inline-flex max-w-80 items-center gap-1 rounded-full bg-accent/15 px-2.5 py-1 text-xs text-accent transition-colors hover:bg-accent/25"
        >
          <span className="truncate font-mono">{expression}</span>
          <X className="icon-text h-3 w-3 shrink-0" aria-hidden />
        </Link>
      )}

      {active.length + (expression ? 1 : 0) > 1 && (
        <Link
          href={withParams(
            path,
            params,
            Object.fromEntries([...filters.map((f) => [f.key, null]), ["f", null], ["page", null]]),
          )}
          className="ml-1 text-xs text-muted transition-colors hover:text-white"
        >
          Clear all
        </Link>
      )}

      {building && (
        <ConditionBuilder key={expression} type={type} path={path} params={params} current={expression} />
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
  const cleared = withParams(path, params, { [filter.key]: null, page: null })

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
        {chosen.length === 1 && !filter.multiple && (
          <span className="font-normal text-white/70">{labelOf(filter, chosen[0])}</span>
        )}
        {filter.multiple && chosen.length > 0 && (
          <span className="tabular-nums text-muted">{chosen.length}</span>
        )}
        <ChevronDown className={cn("icon-text h-3 w-3 transition-transform", open && "rotate-180")} aria-hidden />
      </button>

      {open && (
        <MenuPanel ref={menu} scroll>
          <MenuLabel
            action={
              chosen.length > 0 && (
                <Link href={cleared} onClick={() => setOpen(false)} className={menuAction}>
                  Clear
                </Link>
              )
            }
          >
            {filter.multiple ? `${filter.label} · any of` : filter.label}
          </MenuLabel>
          {filter.choices.map((choice) => (
            <Option
              key={choice.value}
              href={toggled(path, params, filter, choice.value)}
              choice={choice}
              on={chosen.includes(choice.value)}
              multiple={!!filter.multiple}
            />
          ))}
        </MenuPanel>
      )}
    </div>
  )
}

function Option({
  href,
  choice,
  on,
  multiple,
}: {
  href: string
  choice: Choice
  on: boolean
  multiple: boolean
}) {
  return (
    <Link href={href} className={menuItem({ className: on ? "text-white" : undefined })} aria-current={on || undefined}>
      <MenuMark kind={multiple ? "check" : "radio"} on={on} />
      {choice.icon && <span className={cn(choice.icon, "shrink-0")} aria-hidden />}
      <span className="truncate">{choice.label}</span>
    </Link>
  )
}

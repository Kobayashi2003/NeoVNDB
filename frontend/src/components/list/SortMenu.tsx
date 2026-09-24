/** The sort links as one dropdown, for narrow screens: the orders, then the
 *  direction. Every entry is a link, like the sort links. */
"use client"

import { useState } from "react"
import Link from "next/link"
import { ArrowDown, ArrowUp, ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"
import { withParams, type Params } from "@/lib/href"
import type { Sort } from "@/lib/list"
import { MenuDivider, MenuLabel, MenuMark, MenuPanel, menuItem } from "@/components/ui/Menu"
import { useMenu } from "@/hooks/useMenu"

export interface SortState {
  sorts: Sort[]
  active: string
  reverse: boolean
}

export function SortMenu({
  path,
  params,
  sorts,
  active,
  reverse,
  align = "start",
}: SortState & { path: string; params: Params; align?: "start" | "end" }) {
  const [open, setOpen] = useState(false)
  const { box, panel } = useMenu(open, setOpen)
  const current = sorts.find((s) => s.value === active)
  const close = () => setOpen(false)

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="inline-flex items-center gap-1 rounded-full bg-white/10 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-white/15"
      >
        <span className="text-muted">Sort:</span>
        {current?.label ?? "Relevance"}
        {reverse ? (
          <ArrowDown className="icon-text size-3 text-muted" aria-label="descending" />
        ) : (
          <ArrowUp className="icon-text size-3 text-muted" aria-label="ascending" />
        )}
        <ChevronDown className={cn("icon-text size-3 transition-transform", open && "rotate-180")} aria-hidden />
      </button>

      {open && (
        <MenuPanel ref={panel} align={align}>
          <MenuLabel>Sort by</MenuLabel>
          {sorts.map((sort) => (
            <Link
              key={sort.value}
              href={withParams(path, params, {
                sort: sort.value,
                reverse: sort.value === active ? (reverse ? "true" : null) : sort.descending ? "true" : null,
                page: null,
              })}
              onClick={close}
              className={menuItem()}
            >
              <MenuMark kind="radio" on={sort.value === active} />
              {sort.label}
            </Link>
          ))}
          <MenuDivider />
          <MenuLabel>Order</MenuLabel>
          {[
            { down: false, label: "Ascending" },
            { down: true, label: "Descending" },
          ].map((o) => (
            <Link
              key={o.label}
              href={withParams(path, params, { sort: active, reverse: o.down ? "true" : null, page: null })}
              onClick={close}
              className={menuItem()}
            >
              <MenuMark kind="radio" on={reverse === o.down} />
              {o.label}
            </Link>
          ))}
        </MenuPanel>
      )}
    </div>
  )
}

/** State shared by the builder: tree edits, the builder context, and the
 *  popover that opens one at a time. */
"use client"

import { createContext, useContext } from "react"
import { complete, ExprError, group, type Group, type Node } from "@/lib/expr"
import { MenuPanel } from "@/components/ui/Menu"
import { useDismiss } from "@/hooks/useDismiss"
import { useKeptOnScreen } from "@/hooks/useKeptOnScreen"

/* --- Tree edits ------------------------------------------------------------- */

/** Replaces the node with this key anywhere, nested relation groups included. */
export function update(node: Node, key: number, fn: (n: Node) => Node | null): Node | null {
  if (node.key === key) return fn(node)
  if (node.kind === "group") {
    return { ...node, items: node.items.flatMap((item) => update(item, key, fn) ?? []) }
  }
  if (typeof node.value !== "string") {
    return { ...node, value: (update(node.value, key, fn) as Group) ?? group() }
  }
  return node
}

/** Drops unfinished conditions and empty groups, except the one being edited
 *  (`keep` is a popover id). */
export function prune(node: Node, keep: string | null, top = false): Node | null {
  if (node.kind === "group") {
    const items = node.items.flatMap((item) => prune(item, keep) ?? [])
    if (items.length === 0 && !top && keep !== `add${node.key}`) return null
    return { ...node, items }
  }
  if (keep === `leaf${node.key}`) return node
  if (typeof node.value === "string") return complete(node) ? node : null
  const nested = prune(node.value, keep)
  return nested ? { ...node, value: nested as Group } : null
}

export function describe(e: unknown): string {
  return e instanceof ExprError ? `${e.message} (at ${e.at + 1})` : String(e)
}

/* --- Shared state ----------------------------------------------------------- */

export interface Builder {
  /** The one popover open, by id: leaf<key>, add<key> or mode<key>. */
  opened: string | null
  open: (id: string | null) => void
  edit: (key: number, fn: (n: Node) => Node | null, then?: string | null) => void
}

export const BuilderContext = createContext<Builder | null>(null)
export const useBuilder = () => useContext(BuilderContext)!

/* --- Popover ---------------------------------------------------------------- */

export function Popover({
  id,
  trigger,
  children,
  wide = false,
}: {
  id: string
  trigger: (open: boolean, toggle: () => void) => React.ReactNode
  children: React.ReactNode
  wide?: boolean
}) {
  const { opened, open } = useBuilder()
  const isOpen = opened === id
  const box = useDismiss<HTMLSpanElement>(isOpen, () => open(null))
  const panel = useKeptOnScreen<HTMLDivElement>(isOpen)
  return (
    <span ref={box} className="relative inline-flex">
      {trigger(isOpen, () => open(isOpen ? null : id))}
      {isOpen && (
        <MenuPanel ref={panel} className={wide ? "w-72" : "w-56"}>
          {children}
        </MenuPanel>
      )}
    </span>
  )
}

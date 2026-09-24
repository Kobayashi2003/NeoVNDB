/** The builder's menus: a group's mode, adding a condition, and the list of
 *  filters to choose from. */
"use client"

import { useState } from "react"
import {
  BookOpen,
  Building2,
  ChevronDown,
  Disc3,
  type LucideIcon,
  PenLine,
  Plus,
  Sparkle,
  Tag,
  UserRound,
} from "lucide-react"
import { conditionOf, CONDITIONS, relatedType } from "@/lib/conditions"
import { group, type Group, leaf } from "@/lib/expr"
import { cn } from "@/lib/utils"
import { menuItem, MenuLabel, MenuMark } from "@/components/ui/Menu"
import { Popover, useBuilder } from "./context"
import { RemoveItem, SearchBox } from "./parts"

/* --- Groups ----------------------------------------------------------------- */

const MODES = [
  { value: "all", and: true, not: false, label: "all", hint: "every condition matches" },
  { value: "any", and: false, not: false, label: "any", hint: "at least one matches" },
  { value: "none", and: false, not: true, label: "none", hint: "no condition matches" },
  { value: "notall", and: true, not: true, label: "not all", hint: "at least one fails" },
]

export function ModeMenu({ node, onRemove }: { node: Group; onRemove?: () => void }) {
  const { edit } = useBuilder()
  const mode = MODES.find((m) => m.and === node.and && m.not === node.not)!
  return (
    <Popover
      id={`mode${node.key}`}
      wide
      trigger={(open, toggle) => (
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          className={cn(
            "inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-medium transition-colors",
            node.not ? "bg-red-400/15 text-red-300" : "bg-white/10 text-white hover:bg-white/15",
          )}
        >
          {mode.label}
          <ChevronDown className={cn("icon-text size-3 transition-transform", open && "rotate-180")} aria-hidden />
        </button>
      )}
    >
      {MODES.map((m) => (
        <button
          key={m.value}
          type="button"
          onClick={() => edit(node.key, (n) => ({ ...(n as Group), and: m.and, not: m.not }), null)}
          className={menuItem()}
        >
          <MenuMark kind="radio" on={m === mode} />
          <span className="font-medium">{m.label}</span>
          <span className="ml-auto text-muted">{m.hint}</span>
        </button>
      ))}
      {onRemove && <RemoveItem onClick={onRemove}>Remove group</RemoveItem>}
    </Popover>
  )
}

export function AddMenu({ type, node, top }: { type: string; node: Group; top: boolean }) {
  const { edit } = useBuilder()
  const add = (name: string) => {
    const bool = conditionOf(type, name)?.kind === "bool"
    const made = leaf(name, "=", bool ? "true" : "")
    edit(node.key, (n) => ({ ...(n as Group), items: [...(n as Group).items, made] }), bool ? null : `leaf${made.key}`)
  }
  const addGroup = () => {
    const made = group(!node.and)
    edit(node.key, (n) => ({ ...(n as Group), items: [...(n as Group).items, made] }), `add${made.key}`)
  }
  const labelled = top || node.items.length === 0

  return (
    <Popover
      id={`add${node.key}`}
      wide
      trigger={(open, toggle) => (
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          aria-label="Add a condition"
          className={cn(
            "inline-flex items-center gap-1 rounded-full border border-dashed text-xs transition-colors",
            labelled ? "px-3 py-1" : "size-6 justify-center",
            open
              ? "border-white/30 bg-white/10 text-white"
              : "border-white/15 text-muted hover:border-white/30 hover:text-white",
          )}
        >
          <Plus className={cn("size-3", labelled && "icon-text")} aria-hidden />
          {labelled && (node.items.length === 0 ? "Add a condition" : "Add")}
        </button>
      )}
    >
      <FilterList type={type} onPick={add} />
      <div className="-mx-1 my-1 h-px bg-white/10" role="separator" />
      <button type="button" onClick={addGroup} className={menuItem()}>
        <Plus className="icon-text size-3.5 text-muted" aria-hidden />
        Group of conditions
      </button>
    </Popover>
  )
}

/** The icon for each type, marking conditions that reach another type. */
const TYPE_ICON: Record<string, LucideIcon> = {
  v: BookOpen,
  r: Disc3,
  c: UserRound,
  p: Building2,
  s: PenLine,
  g: Tag,
  i: Sparkle,
}

export function TypeIcon({ type, className }: { type: string; className?: string }) {
  const Icon = TYPE_ICON[type]
  return Icon ? <Icon className={cn("icon-text size-3 shrink-0", className)} aria-hidden /> : null
}

/** The item's own properties first, then conditions about related items. */
export function FilterList({ type, onPick }: { type: string; onPick: (name: string) => void }) {
  const [term, setTerm] = useState("")
  const q = term.trim().toLowerCase()
  const shown = (CONDITIONS[type] ?? []).filter((c) => c.label.toLowerCase().includes(q))
  const own = shown.filter((c) => !relatedType(c))
  const related = shown.filter((c) => relatedType(c))
  const first = own[0] ?? related[0]
  return (
    <>
      <SearchBox value={term} onChange={setTerm} label="Find a filter" onEnter={() => first && onPick(first.key)} />
      <div className="max-h-72 overflow-y-auto overscroll-contain">
        {own.length > 0 && <MenuLabel>Properties</MenuLabel>}
        {own.map((c) => (
          <button key={c.key} type="button" onClick={() => onPick(c.key)} className={menuItem()}>
            {c.label}
          </button>
        ))}
        {related.length > 0 && <MenuLabel>Related</MenuLabel>}
        {related.map((c) => (
          <button key={c.key} type="button" onClick={() => onPick(c.key)} className={menuItem()}>
            <TypeIcon type={relatedType(c)!} className="text-sky-300/80" />
            {c.label}
            {c.kind === "relation" && <span className="ml-auto text-[0.6875rem] text-muted">by details</span>}
          </button>
        ))}
        {shown.length === 0 && <p className="px-2.5 py-1.5 text-xs text-muted">No such filter.</p>}
      </div>
    </>
  )
}

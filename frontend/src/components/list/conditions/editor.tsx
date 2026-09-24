/** The popover body for one condition, and its value editors. */
"use client"

import { useState } from "react"
import { Plus } from "lucide-react"
import {
  type Condition,
  conditionOf,
  NOUN,
  OP_LABEL,
  opsFor,
  readScored,
  writeScored,
} from "@/lib/conditions"
import { group, leaf, type Leaf, type Op } from "@/lib/expr"
import { cn } from "@/lib/utils"
import { menuAction, menuItem, MenuLabel, MenuMark } from "@/components/ui/Menu"
import { Segmented } from "@/components/ui/Segmented"
import { useBuilder } from "./context"
import { EntitySearch, useEntityName } from "./entity"
import { FilterList } from "./menus"
import { values } from "./text"
import { DoneButton, INPUT, RemoveItem, SearchBox } from "./parts"

export function Editor({ type, cond, node }: { type: string; cond: Condition | undefined; node: Leaf }) {
  const { edit, open } = useBuilder()
  const set = (change: Partial<Leaf>, then?: string | null) =>
    edit(node.key, (n) => ({ ...(n as Leaf), ...change }), then)
  const done = () => open(null)

  if (!node.name || !cond) {
    return (
      <FilterList
        type={type}
        onPick={(name) => {
          const bool = conditionOf(type, name)?.kind === "bool"
          set({ name, op: "=", value: bool ? "true" : "" }, bool ? null : undefined)
        }}
      />
    )
  }

  const heading = (
    <MenuLabel
      action={
        <button type="button" onClick={() => set({ name: "", op: "=", value: "" })} className={menuAction}>
          Change filter
        </button>
      }
    >
      {cond.label}
    </MenuLabel>
  )

  if (cond.kind === "relation") {
    const nested = typeof node.value !== "string"
    const noun = NOUN[cond.target]
    const modes = [
      { id: "is", op: "=" as Op, has: false, label: `is this ${noun}` },
      { id: "isnot", op: "!=" as Op, has: false, label: `is not this ${noun}` },
      { id: "has", op: "=" as Op, has: true, label: `has one with…` },
      { id: "hasnot", op: "!=" as Op, has: true, label: `has none with…` },
    ]
    return (
      <>
        {heading}
        {modes.map((m) => (
          <button
            key={m.id}
            type="button"
            className={menuItem()}
            onClick={() => {
              if (m.has === nested) return set({ op: m.op }, m.has ? null : undefined)
              if (m.has) {
                const inner = group()
                return set({ op: m.op, value: inner }, `add${inner.key}`)
              }
              set({ op: m.op, value: "" })
            }}
          >
            <MenuMark kind="radio" on={m.has === nested && m.op === node.op} />
            {m.label}
          </button>
        ))}
        {!nested && (
          <>
            <div className="-mx-1 my-1 h-px bg-white/10" role="separator" />
            <EntityValue type={cond.target} node={node} set={set} />
          </>
        )}
        {nested && <RemoveItem onClick={() => edit(node.key, () => null, null)}>Remove condition</RemoveItem>}
      </>
    )
  }

  const ops = opsFor(cond)
  const chosen = typeof node.value === "string" ? values(node.value) : []
  const several = (cond.kind === "enum" || cond.kind === "entity") && chosen.length > 1
  // "All of" cannot be one condition: it is one per value, joined by and.
  const options = several
    ? [
        { value: "=", label: "any of" },
        { value: "all", label: "all of" },
        { value: "!=", label: "none of" },
      ]
    : ops.map((op) => ({ value: op as string, label: OP_LABEL[op] }))
  const choose = (v: string) => {
    if (v !== "all") return set({ op: v as Op })
    edit(node.key, () => group(true, chosen.map((c) => leaf(node.name, "=", c))), null)
  }
  return (
    <>
      {heading}
      {ops.length > 1 && (
        <div className="px-1.5 pb-1.5">
          <Segmented label="Comparison" value={node.op as string} onChange={choose} options={options} />
        </div>
      )}
      <Value cond={cond} node={node} set={set} done={done} />
    </>
  )
}

function Value({
  cond,
  node,
  set,
  done,
}: {
  cond: Condition
  node: Leaf
  set: (change: Partial<Leaf>, then?: string | null) => void
  done: () => void
}) {
  const value = node.value as string
  const [term, setTerm] = useState("")

  switch (cond.kind) {
    case "enum": {
      const q = term.trim().toLowerCase()
      const shown = cond.choices.filter((c) => c.label.toLowerCase().includes(q))
      const chosen = values(value)
      const toggle = (v: string) =>
        set({ value: (chosen.includes(v) ? chosen.filter((c) => c !== v) : [...chosen, v]).join(",") })
      return (
        <>
          {cond.choices.length > 8 && (
            <SearchBox value={term} onChange={setTerm} label="Find" onEnter={() => shown[0] && toggle(shown[0].value)} />
          )}
          <div className="max-h-64 overflow-y-auto overscroll-contain">
            {shown.map((c) => (
              <button key={c.value} type="button" onClick={() => toggle(c.value)} className={menuItem()}>
                <MenuMark kind="check" on={chosen.includes(c.value)} />
                {c.icon && <span className={cn(c.icon, "shrink-0")} aria-hidden />}
                <span className="truncate">{c.label}</span>
              </button>
            ))}
          </div>
          <div className="flex items-center justify-between gap-2 border-t border-white/10 px-1.5 pt-1.5">
            <span className="text-[0.6875rem] text-muted">
              {chosen.length > 1 ? `${chosen.length} chosen` : "Choose one or more"}
            </span>
            <DoneButton onClick={done} disabled={chosen.length === 0} />
          </div>
        </>
      )
    }
    case "bool":
      return (
        <>
          {[
            { v: "true", label: "Yes" },
            { v: "false", label: "No" },
          ].map((o) => (
            <button key={o.v} type="button" onClick={() => set({ value: o.v }, null)} className={menuItem()}>
              <MenuMark kind="radio" on={value === o.v} />
              {o.label}
            </button>
          ))}
        </>
      )
    case "entity":
      return <EntityValue type={cond.target} node={node} set={set} />
    case "scored": {
      const v = readScored(value, cond.score)
      const put = (change: Partial<typeof v>, then?: string | null) =>
        set({ value: writeScored({ ...v, ...change }, cond.score) }, then)
      if (!v.id) return <EntitySearch type={cond.target} onPick={(id: string) => put({ id })} />
      return (
        <div className="flex flex-col gap-2 px-1.5 pb-1.5">
          <Picked type={cond.target} id={v.id} onAction={() => put({ id: "", score: "", spoiler: "" })} />
          {cond.score && (
            <label className="flex items-center justify-between gap-2 px-1 text-xs text-muted">
              Minimum score
              <input
                type="number"
                step="0.1"
                min="0"
                max="3"
                value={v.score}
                onChange={(e) => put({ score: e.target.value })}
                placeholder="any"
                className={cn(INPUT, "w-20")}
              />
            </label>
          )}
          <Segmented
            label="Spoilers"
            value={v.spoiler || "any"}
            onChange={(s) => put({ spoiler: s === "any" ? "" : s })}
            options={[
              { value: "any", label: "Any spoiler" },
              { value: "0", label: "None" },
              { value: "1", label: "Minor" },
            ]}
          />
          <DoneButton onClick={done} />
        </div>
      )
    }
    default:
      return (
        <div className="flex flex-col gap-2 px-1.5 pb-1.5">
          <input
            autoFocus
            type={cond.kind === "number" ? "number" : "text"}
            value={value}
            onChange={(e) => set({ value: e.target.value })}
            onKeyDown={(e) => e.key === "Enter" && value.trim() && done()}
            placeholder={
              cond.kind === "date"
                ? "2020, 2020-05 or 2020-05-17"
                : cond.kind === "text" || cond.kind === "number"
                  ? cond.hint
                  : ""
            }
            aria-label={cond.label}
            className={cn(INPUT, "w-full")}
          />
          <DoneButton onClick={done} disabled={!value.trim()} />
        </div>
      )
  }
}

function EntityValue({
  type,
  node,
  set,
}: {
  type: string
  node: Leaf
  set: (change: Partial<Leaf>, then?: string | null) => void
}) {
  const ids = typeof node.value === "string" ? values(node.value) : []
  const [adding, setAdding] = useState(false)
  if (ids.length === 0) return <EntitySearch type={type} onPick={(id: string) => set({ value: id }, null)} />
  return (
    <div className="flex flex-col gap-1 px-1.5 pb-1.5">
      {ids.map((id) => (
        <Picked
          key={id}
          type={type}
          id={id}
          action="Remove"
          onAction={() => set({ value: ids.filter((x) => x !== id).join(",") })}
        />
      ))}
      {adding ? (
        <div className="-mx-1.5 mt-1">
          <EntitySearch
            type={type}
            onPick={(id: string) => {
              set({ value: [...new Set([...ids, id])].join(",") })
              setAdding(false)
            }}
          />
        </div>
      ) : (
        <button type="button" onClick={() => setAdding(true)} className={cn(menuItem(), "-mx-0 text-muted")}>
          <Plus className="icon-text size-3.5" aria-hidden />
          Add another
        </button>
      )}
    </div>
  )
}

function Picked({
  type,
  id,
  action = "Change",
  onAction,
}: {
  type: string
  id: string
  action?: string
  onAction: () => void
}) {
  const name = useEntityName(type, id)
  return (
    <div className="flex items-center gap-2 rounded-lg bg-white/[0.06] px-2.5 py-1.5 text-xs">
      <span className="min-w-0 flex-1 truncate text-white">{name}</span>
      <span className="font-mono text-[0.6875rem] text-muted">{id}</span>
      <button type="button" onClick={onAction} className={menuAction}>
        {action}
      </button>
    </div>
  )
}

/** The advanced filter. Conditions read as a sentence of chips; clicking one
 *  edits it in a popover like the filter menus. The same tree can be written as
 *  f= text. Nothing reaches the address until Apply. */
"use client"

import { createContext, Fragment, useContext, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import {
  BookOpen,
  Building2,
  ChevronDown,
  Code2,
  Disc3,
  PenLine,
  Plus,
  Search,
  Sparkle,
  Tag,
  UserRound,
  Wand2,
  X,
  type LucideIcon,
} from "lucide-react"
import { ApiError, list } from "@/lib/api"
import {
  CONDITIONS,
  NOUN,
  TIDY_RULES,
  OP_LABEL,
  conditionOf,
  opsFor,
  relatedType,
  readScored,
  writeScored,
  type Condition,
} from "@/lib/conditions"
import {
  ExprError,
  complete,
  group,
  leaf,
  outline,
  parse,
  print,
  switchAt,
  tidy,
  type Group,
  type Leaf,
  type Node,
  type Op,
} from "@/lib/expr"
import { withParams, type Params } from "@/lib/href"
import { LIST } from "@/lib/list"
import { cn } from "@/lib/utils"
import { MenuLabel, MenuMark, MenuPanel, menuAction, menuItem } from "@/components/ui/Menu"
import { Segmented } from "@/components/ui/Segmented"
import { useDismiss } from "@/hooks/useDismiss"
import { useKeptOnScreen } from "@/hooks/useKeptOnScreen"
import { EntitySearch, useEntityName } from "./EntityPicker"

/* --- Tree edits ------------------------------------------------------------- */

/** Replaces the node with this key anywhere, nested relation groups included. */
function update(node: Node, key: number, fn: (n: Node) => Node | null): Node | null {
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
function prune(node: Node, keep: string | null, top = false): Node | null {
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

function describe(e: unknown): string {
  return e instanceof ExprError ? `${e.message} (at ${e.at + 1})` : String(e)
}

/* --- Shared state ----------------------------------------------------------- */

interface Builder {
  /** The one popover open, by id: leaf<key>, add<key> or mode<key>. */
  opened: string | null
  open: (id: string | null) => void
  edit: (key: number, fn: (n: Node) => Node | null, then?: string | null) => void
}

const BuilderContext = createContext<Builder | null>(null)
const useBuilder = () => useContext(BuilderContext)!

/* --- Panel ------------------------------------------------------------------ */

export function ConditionBuilder({
  type,
  path,
  params,
  current,
}: {
  type: string
  path: string
  params: Params
  /** The f= in the address. */
  current: string
}) {
  const router = useRouter()
  const [state, setState] = useState(() => {
    try {
      return { root: parse(current), text: current, error: null as string | null }
    } catch (e) {
      return { root: group(), text: current, error: describe(e) as string | null }
    }
  })
  const [opened, setOpened] = useState<string | null>(null)
  const [asText, setAsText] = useState(state.error !== null)
  const { root, text, error } = state

  const commit = (next: Group, then: string | null) => {
    const kept = (prune(next, then, true) as Group) ?? group()
    setState({ root: kept, text: print(kept), error: null })
    setOpened(then)
  }
  const builder: Builder = {
    opened,
    open: (id) => commit(root, id),
    edit: (key, fn, then = opened) => commit((update(root, key, fn) as Group) ?? group(), then),
  }
  const setText = (next: string) => {
    try {
      setState({ root: parse(next), text: next, error: null })
    } catch (e) {
      setState((s) => ({ ...s, text: next, error: describe(e) }))
    }
  }

  const tidied = tidy(root, type, TIDY_RULES)
  const untidy = !error && outline(tidied) !== outline(root)

  const expression = error ? null : text.trim()
  const preview = usePreview(type, params, expression)
  const changed = expression !== null && expression !== current.trim()

  return (
    <BuilderContext value={builder}>
      <div className="flex w-full basis-full flex-col rounded-xl border border-white/10 bg-surface">
        {asText && (
          <div className="flex flex-col gap-1.5 border-b border-white/5 p-3">
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              spellCheck={false}
              rows={1}
              aria-label="Conditions as text"
              placeholder="Write conditions as text"
              className={cn(
                "min-h-8 w-full resize-none rounded-lg border bg-white/[0.04] px-3 py-1.5 font-mono text-xs leading-relaxed text-white outline-none [field-sizing:content] placeholder:font-sans placeholder:text-muted",
                error ? "border-red-400/60" : "border-white/10 focus:border-white/30",
              )}
            />
            <p className={cn("text-[0.6875rem]", error ? "text-red-400" : "text-muted")} role={error ? "alert" : undefined}>
              {error ?? (
                <>
                  <code>,</code> or · <code>+</code> and · <code>!</code> not · <code>( )</code> group ·{" "}
                  <code>&quot;…&quot;</code> quote · <code>release=(…)</code> about a related item
                </>
              )}
            </p>
          </div>
        )}

        <div className="flex flex-col gap-2.5 p-3">
          <div className="flex items-center gap-1.5 text-xs text-muted">
            Show {LIST[type].label.toLowerCase()} matching
            <ModeMenu node={root} />
            of these:
          </div>
          <Flow type={type} node={root} top />
        </div>

        <div className="flex flex-wrap items-center justify-end gap-1 border-t border-white/5 px-3 py-2 text-xs">
          <span className="mr-auto tabular-nums text-muted" aria-live="polite">
            {preview}
          </span>
          <button
            type="button"
            onClick={() => commit(tidied, null)}
            disabled={!untidy}
            title="Merge, flatten and simplify without changing the results"
            className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-muted transition-colors hover:bg-white/10 hover:text-white disabled:pointer-events-none disabled:opacity-40"
          >
            <Wand2 className="icon-text size-3.5" aria-hidden />
            Tidy
          </button>
          <button
            type="button"
            onClick={() => setAsText((t) => !t)}
            aria-pressed={asText}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-3 py-1 transition-colors",
              asText ? "bg-white/10 text-white" : "text-muted hover:bg-white/10 hover:text-white",
            )}
          >
            <Code2 className="icon-text size-3.5" aria-hidden />
            Text
          </button>
          {current && (
            <button
              type="button"
              onClick={() => router.push(withParams(path, params, { f: null, page: null }))}
              className="rounded-full px-3 py-1 text-muted transition-colors hover:bg-white/10 hover:text-white"
            >
              Clear
            </button>
          )}
          <button
            type="button"
            disabled={expression === null || !changed}
            onClick={() => router.push(withParams(path, params, { f: expression || null, page: null }))}
            className="ml-1 rounded-full bg-accent px-3.5 py-1 font-medium text-black transition-colors hover:bg-accent-hover disabled:bg-white/10 disabled:text-muted"
          >
            Apply
          </button>
        </div>
      </div>
    </BuilderContext>
  )
}

/** Live match count for the expression, alongside the page's other filters. */
function usePreview(type: string, params: Params, expression: string | null): string {
  const [answer, setAnswer] = useState<{ for: string; text: string } | null>(null)

  useEffect(() => {
    if (expression === null) return
    let live = true
    const timer = setTimeout(() => {
      const filters: Record<string, string> = {}
      for (const [k, v] of Object.entries(params)) {
        const one = Array.isArray(v) ? v[0] : v
        if (one && !["f", "page", "sort", "reverse", "limit", "fields"].includes(k)) filters[k] = one
      }
      if (expression) filters.f = expression
      list(LIST[type].type, { fields: "id", limit: 1, filters }).then(
        (page) => live && setAnswer({ for: expression, text: `${page.count.toLocaleString()} matches` }),
        (e) =>
          live &&
          setAnswer({
            for: expression,
            text: e instanceof ApiError && e.status === 400 ? e.message : "Could not count",
          }),
      )
    }, 400)
    return () => {
      live = false
      clearTimeout(timer)
    }
  }, [type, params, expression])

  if (expression === null) return ""
  return answer?.for === expression ? answer.text : "Counting…"
}

/* --- Popover ---------------------------------------------------------------- */

function Popover({
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

/* --- Groups ----------------------------------------------------------------- */

const MODES = [
  { value: "all", and: true, not: false, label: "all", hint: "every condition matches" },
  { value: "any", and: false, not: false, label: "any", hint: "at least one matches" },
  { value: "none", and: false, not: true, label: "none", hint: "no condition matches" },
  { value: "notall", and: true, not: true, label: "not all", hint: "at least one fails" },
]

function ModeMenu({ node, onRemove }: { node: Group; onRemove?: () => void }) {
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

/** A group's conditions in a row, joined by and/or, ending in an add button. */
function Flow({ type, node, top = false }: { type: string; node: Group; top?: boolean }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {node.items.map((item, i) => (
        <span key={item.key} className="inline-flex min-w-0 max-w-full items-center gap-1.5">
          {i > 0 && <Connector node={node} at={i} />}
          {item.kind === "group" ? <SubGroup type={type} node={item} /> : <Chip type={type} node={item} />}
        </span>
      ))}
      <AddMenu type={type} node={node} top={top} />
    </div>
  )
}

/** The and/or between two items; clicking switches it, regrouping by precedence. */
function Connector({ node, at }: { node: Group; at: number }) {
  const { edit } = useBuilder()
  return (
    <button
      type="button"
      onClick={() => edit(node.key, (n) => switchAt(n as Group, at), null)}
      title={`Change to "${node.and ? "or" : "and"}"`}
      className="rounded px-1 text-[0.6875rem] text-muted underline decoration-white/25 decoration-dotted underline-offset-2 transition-colors hover:bg-white/10 hover:text-white"
    >
      {node.and ? "and" : "or"}
    </button>
  )
}

function SubGroup({ type, node }: { type: string; node: Group }) {
  const { edit } = useBuilder()
  return (
    <span className="inline-flex min-w-0 max-w-full flex-wrap items-center gap-1.5 rounded-2xl bg-white/[0.04] px-1.5 py-1 ring-1 ring-inset ring-white/10">
      <ModeMenu node={node} onRemove={() => edit(node.key, () => null, null)} />
      <span className="text-[0.6875rem] text-muted">of</span>
      <Flow type={type} node={node} />
    </span>
  )
}

function AddMenu({ type, node, top }: { type: string; node: Group; top: boolean }) {
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

function TypeIcon({ type, className }: { type: string; className?: string }) {
  const Icon = TYPE_ICON[type]
  return Icon ? <Icon className={cn("icon-text size-3 shrink-0", className)} aria-hidden /> : null
}

/** The item's own properties first, then conditions about related items. */
function FilterList({ type, onPick }: { type: string; onPick: (name: string) => void }) {
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

/* --- Conditions ------------------------------------------------------------- */

function Chip({ type, node }: { type: string; node: Leaf }) {
  const { edit } = useBuilder()
  const cond = conditionOf(type, node.name)
  const nested = typeof node.value !== "string" ? node.value : null
  const remove = <RemoveButton label="Remove condition" onClick={() => edit(node.key, () => null, null)} />

  const editor = (
    <Popover
      id={`leaf${node.key}`}
      wide
      trigger={(open, toggle) => (
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          className={cn(
            "inline-flex min-w-0 max-w-full items-center gap-1 py-1 pl-2.5 text-left",
            nested ? "pr-1.5" : "pr-0.5",
          )}
        >
          {relatedType(cond) && (
            <TypeIcon type={relatedType(cond)!} className={nested ? "text-sky-300" : "text-accent/70"} />
          )}
          <span className={nested ? "text-sky-300/80" : "text-accent/70"}>
            {cond?.label ?? (node.name || "New condition")}:
          </span>
          <span className="min-w-0 truncate text-white">
            <Summary cond={cond} node={node} />
          </span>
        </button>
      )}
    >
      <Editor type={type} cond={cond} node={node} />
    </Popover>
  )

  if (nested && cond?.kind === "relation") {
    return (
      // A condition about another type holds its own sentence, so it is set
      // apart from the green property chips in a colour of its own.
      <span className="inline-flex min-w-0 max-w-full flex-wrap items-center gap-1.5 rounded-2xl bg-sky-400/[0.07] py-0.5 pr-1 text-xs text-sky-200 ring-1 ring-inset ring-sky-400/25">
        {editor}
        {nested.items.length > 1 && (
          <>
            <ModeMenu node={nested} />
            <span className="text-[0.6875rem] text-sky-300/60">of</span>
          </>
        )}
        <Flow type={cond.target} node={nested} />
      </span>
    )
  }

  return (
    <span className="inline-flex items-center gap-0.5 rounded-full bg-accent/15 pr-1 text-xs text-accent transition-colors hover:bg-accent/25">
      {editor}
      {remove}
    </span>
  )
}

/** What a chip says after its filter's name. */
function Summary({ cond, node }: { cond: Condition | undefined; node: Leaf }) {
  const not = node.op === "!="
  if (typeof node.value !== "string") return <span>{not ? "has none with" : "has one with"}</span>
  const value = node.value
  if (!node.name || !value) return <span className="italic text-accent/60">…</span>

  switch (cond?.kind) {
    case "bool":
      return <span>{value === "true" ? "yes" : "no"}</span>
    case "enum": {
      const labels = values(value).map((v) => cond.choices.find((c) => c.value === v)?.label ?? v)
      return <span>{listed(labels, not)}</span>
    }
    case "number":
    case "date":
      return <span>{node.op === "=" ? value : `${OP_LABEL[node.op]} ${value}`}</span>
    case "text":
      return <span>“{value}”</span>
    case "entity":
    case "relation":
      return <EntityList type={cond.target} ids={values(value)} not={not} />
    case "scored": {
      const v = readScored(value, cond.score)
      const extra = [
        v.score && Number(v.score) > 0 ? `≥ ${v.score}` : "",
        v.spoiler === "0" ? "no spoilers" : v.spoiler === "1" ? "minor spoilers" : "",
      ].filter(Boolean)
      return (
        <span className="inline-flex min-w-0 items-center gap-1">
          <EntityList type={cond.target} ids={[v.id]} not={not} />
          {extra.length > 0 && <span className="text-accent/60">{extra.join(" · ")}</span>}
        </span>
      )
    }
    default:
      return <span className="font-mono">{`${node.op}${value}`}</span>
  }
}

const values = (value: string) => value.split(",").map((v) => v.trim()).filter(Boolean)

function listed(labels: string[], not: boolean): string {
  if (labels.length === 1) return not ? `not ${labels[0]}` : labels[0]
  return not ? `none of ${labels.join(", ")}` : labels.join(" or ")
}

function EntityList({ type, ids, not }: { type: string; ids: string[]; not: boolean }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-1">
      {not && <span>{ids.length > 1 ? "none of" : "not"}</span>}
      {ids.map((id, i) => (
        <Fragment key={id}>
          {i > 0 && <span className="text-accent/60">{not ? "," : "or"}</span>}
          <EntityName type={type} id={id} />
        </Fragment>
      ))}
    </span>
  )
}

function EntityName({ type, id }: { type: string; id: string }) {
  return <span className="max-w-40 truncate">{useEntityName(type, id)}</span>
}

/** The popover body for one condition. */
function Editor({ type, cond, node }: { type: string; cond: Condition | undefined; node: Leaf }) {
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

/* --- Small parts ------------------------------------------------------------ */

const INPUT =
  "rounded-lg border border-white/10 bg-white/[0.06] px-2.5 py-1.5 text-xs text-white outline-none [color-scheme:dark] placeholder:text-muted focus:border-white/30"

function SearchBox({
  value,
  onChange,
  label,
  onEnter,
}: {
  value: string
  onChange: (v: string) => void
  label: string
  onEnter: () => void
}) {
  return (
    <div className="mx-1 mb-1 flex items-center gap-2 rounded-lg bg-white/[0.06] px-2.5 py-1.5">
      <Search className="icon-text size-3.5 shrink-0 text-muted" aria-hidden />
      <input
        autoFocus
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key !== "Enter") return
          e.preventDefault()
          onEnter()
        }}
        placeholder={`${label}…`}
        aria-label={label}
        className="min-w-0 flex-1 bg-transparent text-xs outline-none placeholder:text-muted"
      />
    </div>
  )
}

function DoneButton({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="self-end rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-white transition-colors hover:bg-white/20 disabled:opacity-40"
    >
      Done
    </button>
  )
}

function RemoveItem({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <>
      <div className="-mx-1 my-1 h-px bg-white/10" role="separator" />
      <button type="button" onClick={onClick} className={menuItem({ className: "text-red-300 hover:text-red-200" })}>
        <X className="icon-text size-3.5" aria-hidden />
        {children}
      </button>
    </>
  )
}

function RemoveButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="icon-text flex size-5 shrink-0 items-center justify-center rounded-full opacity-60 transition-opacity hover:bg-white/10 hover:opacity-100"
    >
      <X className="size-3" aria-hidden />
    </button>
  )
}

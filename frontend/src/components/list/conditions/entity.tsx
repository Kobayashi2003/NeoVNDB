/** Finding one entity by name for the condition builder, and showing the name
 *  of one already chosen. Typing a full id (g749) uses it as-is. */
"use client"

import { useEffect, useState } from "react"
import { Search } from "lucide-react"
import { list } from "@/lib/api"
import { LIST } from "@/lib/list"
import { NOUN } from "@/lib/conditions"
import { menuItem } from "@/components/ui/Menu"

interface Named {
  id: string
  title?: string
  name?: string
}

const nameField = (type: string) => (type === "v" || type === "r" ? "title" : "name")

/** Names already looked up, shared by every chip on the page. */
const names = new Map<string, string>()

/** The display name of an id, or the id until it arrives. */
export function useEntityName(type: string, id: string): string {
  const [, loaded] = useState(0)

  useEffect(() => {
    if (!id || names.has(id)) return
    let live = true
    list<Named>(LIST[type].type, { fields: nameField(type), limit: 1, filters: { id } }).then(
      (page) => {
        const row = page.results[0]
        if (row) names.set(row.id, row.title ?? row.name ?? row.id)
        if (live) loaded((n) => n + 1)
      },
      () => {},
    )
    return () => {
      live = false
    }
  }, [type, id])

  return names.get(id) ?? id
}

/** A search box with its results listed underneath, for inside a popover. */
export function EntitySearch({ type, onPick }: { type: string; onPick: (id: string) => void }) {
  const [term, setTerm] = useState("")
  const [hits, setHits] = useState<{ for: string; rows: Named[] }>({ for: "", rows: [] })
  const q = term.trim()
  const asID = new RegExp(`^${type}\\d+$`, "i").test(q)

  useEffect(() => {
    if (q.length < 2) return
    let live = true
    const timer = setTimeout(() => {
      list<Named>(LIST[type].type, {
        fields: nameField(type),
        limit: 8,
        sort: "searchrank",
        reverse: true,
        filters: { search: q },
      }).then(
        (page) => {
          for (const row of page.results) names.set(row.id, row.title ?? row.name ?? row.id)
          if (live) setHits({ for: q, rows: page.results })
        },
        () => live && setHits({ for: q, rows: [] }),
      )
    }, 250)
    return () => {
      live = false
      clearTimeout(timer)
    }
  }, [type, q])

  const rows = hits.for === q && q.length >= 2 ? hits.rows : []
  const pick = (id: string) => onPick(id.toLowerCase())

  return (
    <div className="flex flex-col">
      <div className="mx-1 mb-1 flex items-center gap-2 rounded-lg bg-white/[0.06] px-2.5 py-1.5">
        <Search className="icon-text size-3.5 shrink-0 text-muted" aria-hidden />
        <input
          autoFocus
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== "Enter") return
            e.preventDefault()
            if (asID) pick(q)
            else if (rows[0]) pick(rows[0].id)
          }}
          placeholder={`Find a ${NOUN[type]}`}
          aria-label={`Find a ${NOUN[type]}`}
          className="min-w-0 flex-1 bg-transparent text-xs outline-none placeholder:text-muted"
        />
      </div>
      {asID && (
        <button type="button" onClick={() => pick(q)} className={menuItem()}>
          Use <span className="font-mono">{q.toLowerCase()}</span>
        </button>
      )}
      {rows.map((row) => (
        <button key={row.id} type="button" onClick={() => pick(row.id)} className={menuItem()}>
          <span className="truncate">{row.title ?? row.name}</span>
          <span className="ml-auto shrink-0 font-mono text-[0.6875rem] text-muted">{row.id}</span>
        </button>
      ))}
      {q.length >= 2 && hits.for === q && rows.length === 0 && !asID && (
        <p className="px-2.5 py-1.5 text-xs text-muted">Nothing found.</p>
      )}
      {q.length < 2 && <p className="px-2.5 py-1.5 text-xs text-muted">Type a name or an id.</p>}
    </div>
  )
}

/** Adds the page's item to the reader's lists. Lives in the header, not the
 *  sidebar, which renders twice (wide and narrow) and would hold two copies.
 *  Hidden when signed out; only lists of the id's type are offered. */
"use client"

import { useEffect, useState } from "react"
import { Bookmark, BookmarkCheck, Check, Loader2, Plus, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { MenuDivider, MenuLabel, MenuMark, MenuPanel, menuItem } from "@/components/ui/Menu"
import {
  addMark,
  collections,
  createCollection,
  holding,
  removeMark,
  RULES,
  UserError,
  type Collection,
} from "@/lib/user"
import { useSession } from "@/hooks/useSession"
import { useKeptOnScreen } from "@/hooks/useKeptOnScreen"
import { useDismiss } from "@/hooks/useDismiss"

export function CollectionButton({ id }: { id: string }) {
  const session = useSession()
  const signedIn = session.status === "in"

  const [held, setHeld] = useState<number[]>([])
  const [lists, setLists] = useState<Collection[] | null>(null)
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const box = useDismiss<HTMLDivElement>(open, () => setOpen(false))
  const menu = useKeptOnScreen<HTMLDivElement>(open)

  // The lists themselves load on open; each page pays one small request.
  useEffect(() => {
    if (!signedIn) return
    let live = true
    holding(id).then(
      (ids) => {
        if (live) setHeld(ids)
      },
      () => {
        // Silent; opening the menu surfaces the error.
      },
    )
    return () => {
      live = false
    }
  }, [signedIn, id])

  if (!signedIn) return null

  const saved = held.length > 0

  // Re-read on every open: other tabs or devices may have changed things.
  async function reveal() {
    setOpen(true)
    setError(null)
    try {
      const [mine, ids] = await Promise.all([collections(id[0]), holding(id)])
      setLists(mine)
      setHeld(ids)
    } catch (err) {
      setError(message(err))
      setLists([])
    }
  }

  async function toggle(list: Collection) {
    const on = held.includes(list.id)
    setError(null)
    // Optimistic; rolled back on failure.
    setHeld((now) => (on ? now.filter((x) => x !== list.id) : [...now, list.id]))
    setLists((now) =>
      now?.map((l) => (l.id === list.id ? { ...l, count: l.count + (on ? -1 : 1) } : l)) ?? null,
    )
    try {
      await (on ? removeMark(list.id, id) : addMark(list.id, id))
    } catch (err) {
      setError(message(err))
      setHeld((now) => (on ? [...now, list.id] : now.filter((x) => x !== list.id)))
      setLists((now) =>
        now?.map((l) => (l.id === list.id ? { ...l, count: l.count + (on ? 1 : -1) } : l)) ?? null,
      )
    }
  }

  /** Creates a list and adds the item to it. */
  async function create(name: string) {
    const made = await createCollection(id[0], name)
    await addMark(made.id, id)
    setLists((now) => [...(now ?? []), { ...made, count: 1 }])
    setHeld((now) => [...now, made.id])
  }

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        onClick={() => (open ? setOpen(false) : reveal())}
        aria-expanded={open}
        className={cn(
          "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors",
          saved
            ? "bg-accent text-background hover:bg-accent-hover"
            : "bg-white/10 hover:bg-white/20",
        )}
      >
        {saved ? (
          <BookmarkCheck className="icon-text h-3.5 w-3.5 shrink-0" aria-hidden />
        ) : (
          <Bookmark className="icon-text h-3.5 w-3.5 shrink-0" aria-hidden />
        )}
        {saved ? "Saved" : "Save"}
      </button>

      {open && (
        // Fixed width: the last row becomes a text field and must not resize the panel.
        <MenuPanel ref={menu} align="end" scroll className="w-60">
          <MenuLabel>Save to</MenuLabel>
          {lists === null ? (
            <p className="flex items-center gap-2 px-2.5 py-1.5 text-xs text-muted">
              <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
              Reading your lists
            </p>
          ) : (
            <>
              {lists.map((list) => (
                <Row
                  key={list.id}
                  list={list}
                  on={held.includes(list.id)}
                  onPick={() => toggle(list)}
                />
              ))}
              {lists.length === 0 && !error && (
                <p className="px-2.5 py-1.5 text-xs text-muted">No lists for this yet.</p>
              )}
              <NewList onCreate={create} onError={setError} />
            </>
          )}

          {error && (
            <p role="alert" className="px-2.5 py-1.5 text-xs text-red-400">
              {error}
            </p>
          )}
        </MenuPanel>
      )}
    </div>
  )
}

function message(err: unknown): string {
  return err instanceof UserError ? err.message : "Something went wrong."
}

function Row({ list, on, onPick }: { list: Collection; on: boolean; onPick: () => void }) {
  return (
    <button
      type="button"
      onClick={onPick}
      aria-pressed={on}
      className={menuItem({ className: on ? "text-white" : undefined })}
    >
      <MenuMark kind="check" on={on} />
      <span className="min-w-0 flex-1 truncate">{list.name}</span>
      <span className="shrink-0 tabular-nums text-muted">{list.count}</span>
    </button>
  )
}

function NewList({
  onCreate,
  onError,
}: {
  onCreate: (name: string) => Promise<void>
  onError: (message: string | null) => void
}) {
  const [naming, setNaming] = useState(false)
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = e.currentTarget
    const name = String(new FormData(form).get("name") ?? "").trim()
    if (!name) return

    setBusy(true)
    onError(null)
    try {
      await onCreate(name)
      form.reset()
      setNaming(false)
    } catch (err) {
      onError(message(err))
    }
    setBusy(false)
  }

  if (!naming) {
    return (
      <>
        <MenuDivider />
        <button
          type="button"
          onClick={() => setNaming(true)}
          className={menuItem({ className: "text-muted" })}
        >
          <Plus className="icon-text size-3.5 shrink-0" aria-hidden />
          New list
        </button>
      </>
    )
  }

  return (
    <>
      <MenuDivider />
      <form onSubmit={submit} className="flex items-center gap-1 px-1 py-0.5">
      {/* autoFocus because opening this form is the whole of the intent to
          type into it, and it is one click deep inside a menu. */}
      <input
        name="name"
        autoFocus
        maxLength={RULES.listName}
        placeholder="List name"
        aria-label="New list name"
        className="min-w-0 flex-1 rounded-lg border border-white/10 bg-background/40 px-2 py-1 text-xs outline-none transition-colors focus:border-white/30"
      />
      <button
        type="submit"
        disabled={busy}
        aria-label="Create list"
        className="shrink-0 rounded p-1 text-accent transition-colors hover:bg-white/10 disabled:opacity-40"
      >
        {busy ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
        ) : (
          <Check className="h-3.5 w-3.5" aria-hidden />
        )}
      </button>
      <button
        type="button"
        onClick={() => {
          setNaming(false)
          onError(null)
        }}
        aria-label="Cancel"
        className="shrink-0 rounded p-1 text-muted transition-colors hover:bg-white/10 hover:text-white"
      >
        <X className="h-3.5 w-3.5" aria-hidden />
      </button>
      </form>
    </>
  )
}

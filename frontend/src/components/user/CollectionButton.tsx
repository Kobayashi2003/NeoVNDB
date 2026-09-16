/** Putting the thing a page is about on one of the reader's lists.
 *
 *  It sits in the detail header's action slot rather than in the sidebar,
 *  because the sidebar is rendered twice -- once for the wide layout and once
 *  for the narrow one -- and two of these would each ask the service what
 *  holds this item, then disagree the moment one of them was used.
 *
 *  Signed out it is not there at all. The browse surface is public and a
 *  reader without an account has nothing to put anything on; the header is
 *  where signing in is offered, and offering it again on every page would be
 *  noise.
 *
 *  A list holds one kind of thing, so the only lists offered are the ones that
 *  can hold this. The type is read off the id -- v17 is a visual novel -- for
 *  the same reason the routes read it there: the id already says it. */
"use client"

import { useEffect, useState } from "react"
import { Bookmark, BookmarkCheck, Check, Loader2, Plus, X } from "lucide-react"
import { cn } from "@/lib/utils"
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
  // Hung from the right of the button, which on a character page is not at the
  // right edge -- the spoiler control is beside it.
  const menu = useKeptOnScreen<HTMLDivElement>(open)

  // Only which lists hold it, which is all the button itself has to say. The
  // lists are not read until the menu is opened, so a reader walking through
  // pages pays one small request each rather than two.
  useEffect(() => {
    if (!signedIn) return
    let live = true
    holding(id).then(
      (ids) => {
        if (live) setHeld(ids)
      },
      () => {
        // The label is not worth an error message. Whatever went wrong will
        // say so again, out loud, the moment the reader opens the menu.
      },
    )
    return () => {
      live = false
    }
  }, [signedIn, id])

  if (!signedIn) return null

  const saved = held.length > 0

  // Read again on every open rather than once: another tab, or the same reader
  // on their phone, may have moved things since. It is also what corrects the
  // counts this component adds up locally while the menu is in use.
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
    // Moved first and put back if the service disagrees: a checkbox that waits
    // for a round trip before it moves reads as a broken one.
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

  /** A new list is made and joined in one step: naming a list is something a
   *  reader does because they want this on it. */
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
          <BookmarkCheck className="h-3.5 w-3.5 shrink-0" aria-hidden />
        ) : (
          <Bookmark className="h-3.5 w-3.5 shrink-0" aria-hidden />
        )}
        {saved ? "Saved" : "Save"}
      </button>

      {open && (
        <div
          ref={menu}
          className="absolute right-0 top-full z-30 mt-1 max-h-80 w-60 max-w-[calc(100vw-2rem)] overflow-y-auto overscroll-contain rounded-lg border border-white/10 bg-[var(--overlay)] p-1 shadow-xl"
        >
          {lists === null ? (
            <p className="flex items-center gap-2 px-2 py-1.5 text-xs text-muted">
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
                <p className="px-2 py-1.5 text-xs text-muted">No lists for this yet.</p>
              )}
              <NewList onCreate={create} onError={setError} />
            </>
          )}

          {error && (
            <p role="alert" className="px-2 py-1.5 text-xs text-red-400">
              {error}
            </p>
          )}
        </div>
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
      className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs transition-colors hover:bg-white/10"
    >
      <span
        className={cn(
          "flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border transition-colors",
          on ? "border-accent bg-accent" : "border-white/25",
        )}
      >
        {on && <Check className="h-2.5 w-2.5 text-background" strokeWidth={4} aria-hidden />}
      </span>
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
      <button
        type="button"
        onClick={() => setNaming(true)}
        className="mt-1 flex w-full items-center gap-2 border-t border-white/10 px-2 py-1.5 pt-2 text-xs text-muted transition-colors hover:text-white"
      >
        <Plus className="h-3 w-3 shrink-0" aria-hidden />
        New list
      </button>
    )
  }

  return (
    <form onSubmit={submit} className="mt-1 flex items-center gap-1 border-t border-white/10 pt-2">
      {/* autoFocus because opening this form is the whole of the intent to
          type into it, and it is one click deep inside a menu. */}
      <input
        name="name"
        autoFocus
        maxLength={RULES.listName}
        placeholder="List name"
        aria-label="New list name"
        className="min-w-0 flex-1 rounded border border-white/10 bg-background/40 px-2 py-1 text-xs outline-none transition-colors focus:border-white/30"
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
  )
}

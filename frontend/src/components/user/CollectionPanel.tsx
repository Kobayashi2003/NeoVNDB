/** One list, and the things on it.
 *
 *  A list holds ids and nothing else -- the user service keeps no copy of what
 *  vndb says, so that a weekly import can replace the whole mirror underneath
 *  it without touching anyone's lists. Which means drawing one is two steps:
 *  ask the service what is on it, then hand those ids to the read API, which
 *  answers a whole page of them in one request. That is what the id-list limit
 *  was for, and it is why a page of marks is no bigger than it.
 *
 *  The read API answers in its own order, so the rows are put back into the
 *  order the reader made: most recently added first. A collection is a record
 *  of what someone did, and when they did it is the only order that is theirs
 *  rather than the data's.
 *
 *  It is also where things come off a list. Saving happens on the page of the
 *  thing being saved, one at a time, which is the shape of that wish; getting
 *  rid of things is the opposite -- a reader tidying up is looking at the list
 *  and means several at once -- so this is the only place that works in
 *  handfuls. */
"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ArrowLeft, ListChecks } from "lucide-react"
import { list as query } from "@/lib/api"
import { LIST, PAGE_SIZE } from "@/lib/list"
import type { Params } from "@/lib/href"
import { Results } from "@/components/list/Results"
import { Pagination } from "@/components/list/Pagination"
import {
  collections,
  marks,
  moveMarks,
  removeMarks,
  UserError,
  type Collection,
} from "@/lib/user"
import { useSession } from "@/hooks/useSession"
import { SignInFirst } from "./SignInFirst"
import { SelectBar, Selectable } from "./SelectBar"

interface Held {
  list: Collection
  /** The reader's other lists of this kind, which is where a move can go. */
  elsewhere: Collection[]
  rows: { id: string }[]
  count: number
}

function message(err: unknown): string {
  return err instanceof UserError ? err.message : "Something went wrong."
}

export function CollectionPanel({
  id,
  page,
  params,
}: {
  id: number
  page: number
  params: Params
}) {
  const session = useSession()
  const router = useRouter()
  const [held, setHeld] = useState<Held | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Bumped after a change, to ask for the page again. What is on the page and
  // what the counts are have both moved, and working the new state out here
  // would be guessing at what the service did.
  const [reloads, setReloads] = useState(0)
  const [selecting, setSelecting] = useState(false)
  const [chosen, setChosen] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [trouble, setTrouble] = useState<string | null>(null)

  useEffect(() => {
    if (session.status !== "in") return
    let live = true

    const read = async (): Promise<Held> => {
      const [mine, page1] = await Promise.all([collections(), marks(id, page, PAGE_SIZE)])
      const list = mine.find((l) => l.id === id)
      if (!list) throw new UserError(404, "No such list.")
      const elsewhere = mine.filter((l) => l.type === list.type && l.id !== id)
      if (page1.results.length === 0) {
        return { list, elsewhere, rows: [], count: page1.count }
      }

      const order = page1.results.map((m) => m.id)
      const spec = LIST[list.type]
      const answer = await query<{ id: string }>(spec.type, {
        fields: spec.fields,
        limit: order.length,
        filters: { id: order.join(",") },
      })
      const byId = new Map(answer.results.map((r) => [r.id, r]))
      // An id with nothing behind it is not an error: vndb hides entries, and
      // a hidden one leaves a mark pointing at nothing until the reader
      // removes it. Better a list one short than a list that will not draw.
      const rows = order.filter((mark) => byId.has(mark)).map((mark) => byId.get(mark)!)
      return { list, elsewhere, rows, count: page1.count }
    }

    read().then(
      (got) => {
        if (!live) return
        // Taking the last things off the last page leaves the reader standing
        // on a page that no longer exists.
        const last = Math.max(1, Math.ceil(got.count / PAGE_SIZE))
        if (page > last) {
          router.replace(last === 1 ? `/u/${id}` : `/u/${id}?page=${last}`)
          return
        }
        setHeld(got)
        const here = got.rows.map((r) => r.id)
        setChosen((now) => now.filter((x) => here.includes(x)))
      },
      (err) => {
        if (live) setError(message(err))
      },
    )
    return () => {
      live = false
    }
  }, [session.status, id, page, reloads, router])

  if (session.status === "unknown") {
    return <div className="h-40 w-full animate-pulse rounded-lg bg-white/5" aria-hidden />
  }
  if (session.status === "out") {
    return <SignInFirst next={`/u/${id}`}>This is one of your lists, so it needs you.</SignInFirst>
  }
  if (error) {
    return (
      <div className="w-full max-w-sm rounded-lg border border-white/5 bg-surface p-6 text-sm">
        <p role="alert" className="text-red-400">
          {error}
        </p>
        <Back />
      </div>
    )
  }
  if (held === null) {
    return <div className="h-64 w-full animate-pulse rounded-lg bg-white/5" aria-hidden />
  }

  const here = held.rows.map((r) => r.id)
  const allOnPage = here.length > 0 && here.every((x) => chosen.includes(x))

  async function act(change: () => Promise<unknown>) {
    setBusy(true)
    setTrouble(null)
    try {
      await change()
      setChosen([])
      setReloads((n) => n + 1)
    } catch (err) {
      setTrouble(message(err))
    }
    setBusy(false)
  }

  return (
    <div className="flex w-full flex-col gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="text-xl font-bold sm:text-2xl">
          {held.list.name}
          <span className="ml-2 text-sm font-normal tabular-nums text-muted">
            {held.count.toLocaleString()}
          </span>
        </h1>
        <div className="flex shrink-0 items-center gap-3">
          {held.rows.length > 0 && !selecting && (
            <button
              type="button"
              onClick={() => setSelecting(true)}
              className="flex items-center gap-1 text-xs text-muted transition-colors hover:text-white"
            >
              <ListChecks className="h-3 w-3" aria-hidden />
              Select
            </button>
          )}
          <Back />
        </div>
      </div>

      {held.rows.length === 0 ? (
        <p className="text-sm text-muted">
          Nothing on this list yet. Saving something from its own page puts it here --{" "}
          <Link href={`/${held.list.type}`} className="text-accent hover:underline">
            browse {LIST[held.list.type].label.toLowerCase()}
          </Link>
          .
        </p>
      ) : (
        <>
          <Results
            type={held.list.type}
            rows={held.rows}
            wrap={
              selecting
                ? (card) => (
                    <Selectable
                      on={chosen.includes(card.id)}
                      grid={card.grid}
                      onToggle={() =>
                        setChosen((now) =>
                          now.includes(card.id)
                            ? now.filter((x) => x !== card.id)
                            : [...now, card.id],
                        )
                      }
                    >
                      {card.node}
                    </Selectable>
                  )
                : undefined
            }
          />
          <Pagination
            path={`/u/${id}`}
            params={params}
            page={page}
            count={held.count}
            pageSize={PAGE_SIZE}
          />
        </>
      )}

      {selecting && (
        <SelectBar
          chosen={chosen.length}
          pageSize={here.length}
          allOnPage={allOnPage}
          lists={held.elsewhere}
          busy={busy}
          error={trouble}
          onAll={() => setChosen(allOnPage ? [] : here)}
          onMove={(to) => act(() => moveMarks(id, to, chosen))}
          onRemove={() => act(() => removeMarks(id, chosen))}
          onClose={() => {
            setSelecting(false)
            setChosen([])
            setTrouble(null)
          }}
        />
      )}
    </div>
  )
}

function Back() {
  return (
    <Link
      href="/u"
      className="flex shrink-0 items-center gap-1 text-xs text-muted transition-colors hover:text-white"
    >
      <ArrowLeft className="h-3 w-3" aria-hidden />
      All lists
    </Link>
  )
}

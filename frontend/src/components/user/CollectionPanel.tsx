/** One list, and the things on it.
 *
 *  A list holds ids and nothing else -- the user service keeps no copy of what
 *  vndb says, so that a weekly import can replace the whole mirror underneath
 *  it without touching anyone's lists. Drawing one is therefore always two
 *  steps: find out what is on it, then ask the read API what those ids are.
 *
 *  Which two steps depends on what was asked for, and the difference is worth
 *  stating because it decides what a list can be sorted by:
 *
 *    - In the order the reader made it, the user service pages the marks and
 *      only a page of ids is ever fetched. This works at any size.
 *    - By anything vndb knows -- a title, a rating, a date -- or with a search
 *      term, the whole list has to go to the read API at once, because neither
 *      the order nor the matching can be worked out a page at a time. That
 *      only holds while the list fits in one request, so past that size those
 *      orders are not offered rather than quietly answered wrong.
 *
 *  Taking things off a list lives here too. Saving happens on the page of the
 *  thing being saved, one at a time, which is the shape of that wish; tidying
 *  up is the opposite -- the reader is looking at the list and means several
 *  at once. */
"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ListChecks, Search, X } from "lucide-react"
import { list as query } from "@/lib/api"
import { LIST, PAGE_SIZE, type Sort } from "@/lib/list"
import { one, withParams, type Params } from "@/lib/href"
import { Results } from "@/components/list/Results"
import { Pagination } from "@/components/list/Pagination"
import { SortLinks } from "@/components/list/SortLinks"
import { ControlLabel } from "@/components/ui/ControlLabel"
import {
  collections,
  items as allItems,
  marks,
  moveMarks,
  removeMarks,
  UserError,
  type Collection,
} from "@/lib/user"
import { useSession } from "@/hooks/useSession"
import { SignInFirst } from "./SignInFirst"
import { SelectBar, Selectable } from "./SelectBar"
import { CollectionColumn, CollectionPicker } from "./CollectionSwitcher"

/** The order the reader put the list in, which is this page's own and not one
 *  the read API has ever heard of. Newest first, because a list is a record of
 *  what someone did and the last thing they did is the interesting end. */
const ADDED = { value: "added", label: "Added", descending: true } as const

/** Which way an order runs when the reader has not said. Looked up across the
 *  types rather than within one, because the list's own type is not known
 *  until it has been read, and a sort name means the same thing in all of
 *  them. */
function orderOf(sort: string): Sort | undefined {
  if (sort === ADDED.value) return ADDED
  for (const spec of Object.values(LIST)) {
    const found = spec.sorts.find((s) => s.value === sort)
    if (found) return found
  }
  return undefined
}

interface Held {
  list: Collection
  mine: Collection[]
  rows: { id: string }[]
  count: number
  /** True when the list is longer than can be handed over in one request, so
   *  only ADDED is on offer. */
  tooBig: boolean
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
  const path = `/u/${id}`

  const search = one(params, "q") ?? ""
  const sort = one(params, "sort") ?? ADDED.value
  // Each order starts at the end worth looking at, and which end that is
  // belongs to the order: newest first for when it was added, best first for a
  // rating, but A before Z for a title. One default for all of them had every
  // list reading backwards the moment it was sorted by anything.
  const asked = one(params, "reverse")
  const reverse = asked !== undefined ? asked === "true" : (orderOf(sort)?.descending ?? false)

  const [held, setHeld] = useState<Held | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [reloads, setReloads] = useState(0)
  const [selecting, setSelecting] = useState(false)
  const [chosen, setChosen] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [trouble, setTrouble] = useState<string | null>(null)

  useEffect(() => {
    if (session.status !== "in") return
    let live = true

    const hydrate = async (ids: string[], type: string, spec = LIST[type]) => {
      if (ids.length === 0) return []
      const answer = await query<{ id: string }>(spec.type, {
        fields: spec.fields,
        limit: ids.length,
        filters: { id: ids.join(",") },
      })
      const byId = new Map(answer.results.map((r) => [r.id, r]))
      // An id with nothing behind it is not an error: vndb hides entries, and
      // a hidden one leaves a mark pointing at nothing until the reader
      // removes it. Better a list one short than a list that will not draw.
      return ids.filter((x) => byId.has(x)).map((x) => byId.get(x)!)
    }

    const read = async (): Promise<Held> => {
      const mine = await collections()
      const list = mine.find((l) => l.id === id)
      if (!list) throw new UserError(404, "No such list.")
      const spec = LIST[list.type]

      // The whole list is needed to sort or search it; in the reader's own
      // order it never is, and that is what lets a long list still be read.
      if (sort === ADDED.value && !search) {
        const held = await marks(id, page, PAGE_SIZE)
        const rows = await hydrate(held.results.map((m) => m.id), list.type, spec)
        return { list, mine, rows, count: held.count, tooBig: false }
      }

      const whole = await allItems(id)
      if (whole.items.length < whole.count) {
        // Too long to hand over. Say so by falling back rather than showing an
        // order that would silently be of part of the list.
        const held = await marks(id, page, PAGE_SIZE)
        const rows = await hydrate(held.results.map((m) => m.id), list.type, spec)
        return { list, mine, rows, count: held.count, tooBig: true }
      }
      if (whole.items.length === 0) {
        return { list, mine, rows: [], count: 0, tooBig: false }
      }

      const answer = await query<{ id: string }>(spec.type, {
        fields: spec.fields,
        page,
        limit: PAGE_SIZE,
        sort: sort === ADDED.value ? spec.defaultSort : sort,
        reverse,
        filters: { id: whole.items.join(","), ...(search ? { search } : {}) },
      })
      return { list, mine, rows: answer.results, count: answer.count, tooBig: false }
    }

    read().then(
      (got) => {
        if (!live) return
        // Taking the last things off the last page leaves the reader standing
        // on a page that no longer exists.
        const last = Math.max(1, Math.ceil(got.count / PAGE_SIZE))
        if (page > last) {
          router.replace(withParams(path, params, { page: last === 1 ? null : String(last) }))
          return
        }
        setHeld(got)
      },
      (err) => {
        if (live) setError(message(err))
      },
    )
    return () => {
      live = false
    }
  }, [session.status, id, page, sort, reverse, search, reloads, router, path, params])

  if (session.status === "unknown") {
    return <div className="h-40 w-full animate-pulse rounded-lg bg-white/5" aria-hidden />
  }
  if (session.status === "out") {
    return <SignInFirst next={path}>This is one of your lists, so it needs you.</SignInFirst>
  }
  if (error) {
    return (
      <div className="w-full max-w-sm rounded-lg border border-white/5 bg-surface p-6 text-sm">
        <p role="alert" className="text-red-400">
          {error}
        </p>
        <Link href="/u" className="mt-3 inline-block text-accent hover:underline">
          All lists
        </Link>
      </div>
    )
  }
  if (held === null) {
    return <div className="h-64 w-full animate-pulse rounded-lg bg-white/5" aria-hidden />
  }

  const here = held.rows.map((r) => r.id)
  const allOnPage = here.length > 0 && here.every((x) => chosen.includes(x))
  // ADDED first: it is the one this page owns, and the one that always works.
  const sorts: Sort[] = [ADDED, ...(held.tooBig ? [] : LIST[held.list.type].sorts)]
  // On a list too long to hand over, an order named in the address was not the
  // one used. Marking the one that was is the only honest thing to highlight.
  const showing = held.tooBig ? ADDED.value : sort

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
    <div className="flex w-full gap-6">
      <CollectionColumn
        lists={held.mine}
        current={id}
        className="hidden w-52 shrink-0 overflow-y-auto lg:flex"
      />

      <div className="flex min-w-0 flex-1 flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <h1 className="truncate text-xl font-bold sm:text-2xl">{held.list.name}</h1>
            <span className="shrink-0 text-sm tabular-nums text-muted">
              {held.count.toLocaleString()}
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <CollectionPicker lists={held.mine} current={id} className="lg:hidden" />
            {held.rows.length > 0 && !selecting && (
              <button
                type="button"
                onClick={() => setSelecting(true)}
                className="flex items-center gap-1 rounded-full px-2 py-1.5 text-xs text-muted transition-colors hover:bg-white/10 hover:text-white"
              >
                <ListChecks className="h-3.5 w-3.5" aria-hidden />
                Select
              </button>
            )}
          </div>
        </div>

        {(held.count > 0 || search) && (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <SortLinks
              path={path}
              params={params}
              sorts={sorts}
              active={showing}
              reverse={reverse}
            />
            <SearchInList path={path} params={params} initial={search} />
          </div>
        )}

        {held.tooBig && (
          <p className="text-xs text-muted">
            This list is longer than can be sorted or searched here, so it stays in the order you
            made it.
          </p>
        )}

        {held.rows.length === 0 ? (
          <p className="text-sm text-muted">
            {search ? (
              <>
                Nothing on this list matches that.{" "}
                <Link
                  href={withParams(path, params, { q: null, page: null })}
                  className="text-accent hover:underline"
                >
                  Clear the search
                </Link>
                .
              </>
            ) : (
              <>
                Nothing on this list yet. Saving something from its own page puts it here --{" "}
                <Link href={`/${held.list.type}`} className="text-accent hover:underline">
                  browse {LIST[held.list.type].label.toLowerCase()}
                </Link>
                .
              </>
            )}
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
              path={path}
              params={params}
              page={page}
              count={held.count}
              pageSize={PAGE_SIZE}
            />
          </>
        )}
      </div>

      {selecting && (
        <SelectBar
          chosen={chosen.length}
          pageSize={here.length}
          allOnPage={allOnPage}
          lists={held.mine.filter((l) => l.type === held.list.type && l.id !== id)}
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

/** Searching inside one list. Like the listings' own search box it navigates
 *  on submit rather than on every keystroke, and for the same reason: each
 *  query is a round trip, and a reader typing a title does not want seven. */
function SearchInList({
  path,
  params,
  initial,
}: {
  path: string
  params: Params
  initial: string
}) {
  const router = useRouter()

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        const term = String(new FormData(e.currentTarget).get("q") ?? "")
        router.push(withParams(path, params, { q: term || null, page: null }))
      }}
      className="flex min-w-0 items-center gap-2 rounded-full border border-white/10 bg-surface px-3 py-1.5"
    >
      <ControlLabel className="mr-0">In list</ControlLabel>
      <Search className="h-3.5 w-3.5 shrink-0 text-muted" aria-hidden />
      <input
        name="q"
        type="search"
        defaultValue={initial}
        placeholder="Search"
        aria-label="Search this list"
        className="min-w-0 flex-1 bg-transparent text-xs outline-none placeholder:text-muted"
      />
      {initial && (
        <Link
          href={withParams(path, params, { q: null, page: null })}
          aria-label="Clear the search"
          className="shrink-0 text-muted transition-colors hover:text-white"
        >
          <X className="h-3.5 w-3.5" aria-hidden />
        </Link>
      )}
    </form>
  )
}

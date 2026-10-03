/** A set of saved ids -- a list, or what the reader rated -- drawn as results.
 *  The ids and what only the reader knows about them (when they were saved,
 *  how they were rated) come from the user service; what the items are comes
 *  from the read API. So drawing one page is two steps:
 *
 *    - An order the user service owns (added, rating, rated): it orders and
 *      pages the ids itself, and the read API fills in that page.
 *    - An order of the read API's (title, release date, ...): every id goes to
 *      it in one request and it orders and pages them, so those orders are not
 *      offered once the set is too long for that.
 *
 *  A search is the read API's either way; under an order of the user service's
 *  it only says which ids match, and the page is cut from those in order.
 *
 *  The last answer stays on screen, dimmed, while the next is fetched, so
 *  paging or re-sorting changes the results and nothing around them. */
"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { ListChecks, Star, X } from "lucide-react"
import { list as query } from "@/lib/api"
import { LIST, PAGE_SIZE, type Sort } from "@/lib/list"
import { one, withParams, type Params } from "@/lib/href"
import type { GoneRow } from "@/lib/types"
import { errorText, type OwnOrder } from "@/lib/user"
import { cn } from "@/lib/utils"
import { Results } from "@/components/list/Results"
import { Pagination } from "@/components/list/Pagination"
import { SortLinks } from "@/components/list/SortLinks"
import { ControlLabel } from "@/components/ui/ControlLabel"
import { SearchPill } from "@/components/ui/SearchPill"
import { Selectable } from "@/components/ui/Selection"
import { useNavigate } from "@/components/layout/Navigation"

/** An order the user service owns. `value` is what the address says and must
 *  not be one of the read API's (it has a "rating" of its own); `by` is what
 *  the service calls it. */
export interface OwnSort extends Sort {
  by: string
}

/** A saved id and the reader's rating of it, if any. */
export interface Owned {
  id: string
  rating: number | null
}

/** Where the ids come from. Both take an order of the service's own. */
export interface ShelfSource {
  page(order: OwnOrder, page: number, limit: number): Promise<{ rows: Owned[]; count: number }>
  /** Every id, or fewer than `count` when the set is too long to hand over. */
  all(order: OwnOrder): Promise<{ items: Owned[]; count: number }>
}

/** What the bulk-action bar is given to work with. */
export interface Choosing {
  chosen: string[]
  here: string[]
  allOnPage: boolean
  busy: boolean
  error: string | null
  onAll: () => void
  /** Runs a change, then clears the choice and reads the page again. */
  act: (change: () => Promise<unknown>) => Promise<void>
  onClose: () => void
}

interface Held {
  /** The request this answers; while it differs from the one wanted, the
   *  rows on screen are the previous answer. */
  key: string
  rows: { id: string }[]
  count: number
  ratings: Map<string, number>
  /** Saved ids the read API no longer has, which its orders leave out. */
  missing: number
  /** Too long for one read API request, so only the service's orders work. */
  tooBig: boolean
}

function goneRow(id: string): GoneRow {
  return { id, gone: true }
}

export function ShelfPanel({
  type,
  source,
  sourceKey,
  own,
  path,
  params,
  page,
  title,
  aside,
  tabs,
  empty,
  bar,
  reloads = 0,
  noun,
}: {
  /** The vndb type letter of what is held; null until known. */
  type: string | null
  source: ShelfSource
  /** Names the set: a new one drops the selection and leaves select mode. */
  sourceKey: string
  /** The service's own orders, the default first. */
  own: OwnSort[]
  path: string
  params: Params
  page: number
  title: React.ReactNode
  /** Beside the title: a list picker. */
  aside?: React.ReactNode
  /** A row of its own under the title, where it may wrap: type tabs. */
  tabs?: React.ReactNode
  empty: React.ReactNode
  bar: (c: Choosing) => React.ReactNode
  /** Bumped by the caller to read again after a change of its own. */
  reloads?: number
  /** What the set is called in sentences: "this list", "your ratings". */
  noun: string
}) {
  const navigate = useNavigate()
  const search = one(params, "q") ?? ""
  const sort = one(params, "sort") ?? own[0].value
  const ownSort = own.find((s) => s.value === sort)
  // Each sort has its own default direction.
  const asked = one(params, "reverse")
  const sorting = ownSort ?? (type ? LIST[type].sorts.find((s) => s.value === sort) : undefined)
  const reverse = asked !== undefined ? asked === "true" : (sorting?.descending ?? false)

  const [held, setHeld] = useState<Held | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [mine, setMine] = useState(0)
  // Kept with the set and page they were made on, so moving to another set
  // or page ends them without an effect to reset them.
  const [selecting, setSelecting] = useState<string | null>(null)
  const [choice, setChoice] = useState<{ where: string; ids: string[] }>({ where: "", ids: [] })
  const [busy, setBusy] = useState(false)
  const [trouble, setTrouble] = useState<string | null>(null)

  const where = `${sourceKey}|${page}`
  const want = `${where}|${sort}|${reverse}|${search}|${reloads}|${mine}`

  useEffect(() => {
    if (!type) return
    let live = true
    const spec = LIST[type]

    const hydrate = async (owned: Owned[]) => {
      if (owned.length === 0) return []
      const answer = await query<{ id: string }>(spec.type, {
        fields: spec.fields,
        limit: owned.length,
        filters: { id: owned.map((o) => o.id).join(",") },
      })
      const byId = new Map(answer.results.map((r) => [r.id, r]))
      return owned.map((o) => byId.get(o.id) ?? goneRow(o.id))
    }
    const rated = (owned: Owned[]) =>
      new Map(owned.filter((o) => o.rating !== null).map((o) => [o.id, o.rating!]))
    const ownDefault: OwnOrder = { sort: own[0].by, ascending: false }

    const read = async (): Promise<Held> => {
      const order: OwnOrder = ownSort ? { sort: ownSort.by, ascending: !reverse } : ownDefault

      if (ownSort && !search) {
        const got = await source.page(order, page, PAGE_SIZE)
        return { key: want, rows: await hydrate(got.rows), count: got.count, ratings: rated(got.rows), missing: 0, tooBig: false }
      }

      const whole = await source.all(order)
      if (whole.items.length < whole.count) {
        // Fall back rather than order or search only part of the set.
        const got = await source.page(ownDefault, page, PAGE_SIZE)
        return { key: want, rows: await hydrate(got.rows), count: got.count, ratings: rated(got.rows), missing: 0, tooBig: true }
      }
      if (whole.items.length === 0) {
        return { key: want, rows: [], count: 0, ratings: new Map(), missing: 0, tooBig: false }
      }
      const ids = whole.items.map((o) => o.id).join(",")

      if (ownSort) {
        // The read API says which match; the order stays the service's.
        const found = await query<{ id: string }>(spec.type, {
          fields: "id",
          limit: whole.items.length,
          filters: { id: ids, search },
        })
        const hit = new Set(found.results.map((r) => r.id))
        const kept = whole.items.filter((o) => hit.has(o.id))
        const shown = kept.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
        return { key: want, rows: await hydrate(shown), count: kept.length, ratings: rated(kept), missing: 0, tooBig: false }
      }

      const answer = await query<{ id: string }>(spec.type, {
        fields: spec.fields,
        page,
        limit: PAGE_SIZE,
        sort,
        reverse,
        filters: { id: ids, ...(search ? { search } : {}) },
      })
      // Without a search every saved id the read API still has is counted,
      // so the shortfall is what it no longer has.
      const missing = search ? 0 : whole.items.length - answer.count
      return { key: want, rows: answer.results, count: answer.count, ratings: rated(whole.items), missing, tooBig: false }
    }

    read().then(
      (got) => {
        if (!live) return
        // Removing the last items can leave the reader past the end.
        const last = Math.max(1, Math.ceil(got.count / PAGE_SIZE))
        if (page > last) {
          navigate.replace(withParams(path, params, { page: last === 1 ? null : String(last) }))
          return
        }
        setHeld(got)
        setError(null)
      },
      (err) => {
        if (live) setError(errorText(err))
      },
    )
    return () => {
      live = false
    }
    // `want` names every input; the functions and objects behind it change
    // identity on each render without changing what they ask for.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [want, type])

  if (error && !held) {
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

  const stale = !held || held.key !== want
  const shownType = type ?? "v"
  const rows = held?.rows ?? []
  const here = rows.map((r) => r.id)
  const chosen = choice.where === where ? choice.ids : []
  const allOnPage = here.length > 0 && here.every((x) => chosen.includes(x))
  const isSelecting = selecting === sourceKey
  const sorts: Sort[] = [...own, ...(held?.tooBig ? [] : LIST[shownType].sorts)]
  // Highlight the order actually used, not the one in the address.
  const showing = held?.tooBig && !ownSort ? own[0].value : sort
  const choose = (ids: string[]) => setChoice({ where, ids })

  async function act(change: () => Promise<unknown>) {
    setBusy(true)
    setTrouble(null)
    try {
      await change()
      choose([])
      setMine((n) => n + 1)
    } catch (err) {
      setTrouble(errorText(err))
    }
    setBusy(false)
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <h1 className="truncate text-xl font-bold sm:text-2xl">{title}</h1>
          {held && (
            <span className="shrink-0 text-sm tabular-nums text-muted">{held.count.toLocaleString()}</span>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {aside}
          {rows.length > 0 && !isSelecting && (
            <button
              type="button"
              onClick={() => setSelecting(sourceKey)}
              className="flex items-center gap-1 rounded-full px-2 py-1.5 text-xs text-muted transition-colors hover:bg-white/10 hover:text-white"
            >
              <ListChecks className="icon-text h-3.5 w-3.5" aria-hidden />
              Select
            </button>
          )}
        </div>
      </div>

      {tabs}

      {(held === null || held.count > 0 || search) && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SortLinks path={path} params={params} sorts={sorts} active={showing} reverse={reverse} />
          <SearchInList path={path} params={params} initial={search} noun={noun} />
        </div>
      )}

      {held?.missing ? (
        <Missing
          count={held.missing}
          noun={noun}
          order={own[0].label}
          href={withParams(path, params, { sort: null, reverse: null, page: null })}
        />
      ) : null}
      {held?.tooBig && (
        <p className="text-xs text-muted">
          This is longer than can be ordered by vndb&apos;s fields or searched here, so only{" "}
          {own.map((s) => s.label.toLowerCase()).join(" and ")} work.
        </p>
      )}
      {error && <p role="alert" className="text-xs text-red-400">{error}</p>}

      {held === null ? (
        <div className="h-64 w-full animate-pulse rounded-lg bg-white/5" aria-hidden />
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted">
          {search ? (
            <>
              Nothing in {noun} matches that.{" "}
              <Link href={withParams(path, params, { q: null, page: null })} className="text-accent hover:underline">
                Clear the search
              </Link>
              .
            </>
          ) : (
            empty
          )}
        </p>
      ) : (
        <div data-results data-stale={stale || undefined} className="flex flex-col gap-4">
          <Results
            type={shownType}
            rows={rows}
            wrap={(card) => {
              const r = held.ratings.get(card.id)
              const node = r ? <Rated rating={r} grid={card.grid}>{card.node}</Rated> : card.node
              return isSelecting ? (
                <Selectable
                  on={chosen.includes(card.id)}
                  grid={card.grid}
                  onToggle={() =>
                    choose(chosen.includes(card.id) ? chosen.filter((x) => x !== card.id) : [...chosen, card.id])
                  }
                >
                  {node}
                </Selectable>
              ) : (
                node
              )
            }}
          />
          <Pagination path={path} params={params} page={page} count={held.count} pageSize={PAGE_SIZE} />
        </div>
      )}

      {isSelecting &&
        bar({
          chosen,
          here,
          allOnPage,
          busy,
          error: trouble,
          onAll: () => choose(allOnPage ? [] : here),
          act,
          onClose: () => {
            setSelecting(null)
            choose([])
            setTrouble(null)
          },
        })}
    </div>
  )
}

/** The reader's rating, on the card it is of. */
function Rated({ rating, grid, children }: { rating: number; grid: boolean; children: React.ReactNode }) {
  return (
    <div className={cn("relative", grid ? "h-full" : "pl-9")}>
      {children}
      <span
        title={`Your rating: ${rating}`}
        className={cn(
          "pointer-events-none absolute flex items-center gap-0.5 rounded-full bg-black/70 px-1.5 py-0.5 text-[0.6875rem] font-semibold tabular-nums text-amber-300",
          grid ? "right-2 top-2" : "left-1.5 top-1/2 -translate-y-1/2",
        )}
      >
        <Star className="h-3 w-3 fill-current" aria-hidden />
        {rating}
      </span>
    </div>
  )
}

/** Saved items a vndb order cannot place, and the way to where they show. */
function Missing({ count, noun, order, href }: { count: number; noun: string; order: string; href: string }) {
  const [entries, are, them] =
    count === 1 ? ["One entry", "is", "it"] : [`${count.toLocaleString()} entries`, "are", "them"]
  return (
    <p className="text-xs text-muted">
      {entries} in {noun} {are} no longer on vndb, so this order leaves {them} out.{" "}
      <Link href={href} className="text-accent hover:underline">
        See {them} by {order.toLowerCase()}
      </Link>
      .
    </p>
  )
}

/** Navigates on submit, not per keystroke. */
function SearchInList({ path, params, initial, noun }: { path: string; params: Params; initial: string; noun: string }) {
  const navigate = useNavigate()
  return (
    <SearchPill
      name="q"
      initial={initial}
      label={`Search ${noun}`}
      onSearch={(term) => navigate.push(withParams(path, params, { q: term || null, page: null }))}
      before={<ControlLabel className="mr-0">In {noun.split(" ").pop()}</ControlLabel>}
      after={
        initial && (
          <Link
            href={withParams(path, params, { q: null, page: null })}
            aria-label="Clear the search"
            className="shrink-0 text-muted transition-colors hover:text-white"
          >
            <X className="h-3.5 w-3.5" aria-hidden />
          </Link>
        )
      }
    />
  )
}

/** A listing of one type.
 *
 *  The whole of its state is in the address: the page, the order, the search
 *  term, and every filter the API understands. Nothing is held in the
 *  component, so a listing can be linked to, bookmarked and walked backwards
 *  through, and the server renders exactly what the address asks for.
 *
 *  Filters are forwarded to the API as they arrive. Everything the API does
 *  not reserve for itself is a filter, so `/v?lang=ja&platform=win` works
 *  without this page knowing those two words -- which is the point of having
 *  built the API that way. A filter it does not know comes back as a message
 *  saying so, which is shown rather than swallowed. */

import { ApiError, list } from "@/lib/api"
import { one, withParams, type Params } from "@/lib/href"
import { LIST, PAGE_SIZE } from "@/lib/list"
import { PrefsControls } from "@/components/ui/PrefsControls"
import { Pagination } from "./Pagination"
import { Results } from "./Results"
import { SearchBox } from "./SearchBox"
import { SortLinks } from "./SortLinks"

/** Reserved by the API for itself; everything else in the query is a filter. */
const RESERVED = new Set(["fields", "sort", "reverse", "page", "limit"])

function filtersOf(params: Params): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [key, value] of Object.entries(params)) {
    if (RESERVED.has(key)) continue
    const single = Array.isArray(value) ? value[0] : value
    if (single) out[key] = single
  }
  return out
}

export async function ListPage({ type, params }: { type: string; params: Params }) {
  const spec = LIST[type]
  const path = `/${type}`
  const page = Math.max(1, Number(one(params, "page") ?? 1) || 1)
  const filters = filtersOf(params)
  const search = filters.search ?? ""

  // A search term brings its own order: how well each row matched. Asking for
  // it without one would sort by nothing at all.
  const sort = one(params, "sort") ?? (search ? "searchrank" : spec.defaultSort)

  // An order that is only interesting from one end starts at that end, whether
  // the reader chose it or arrived at it. Sorting by rating and getting the
  // worst-rated visual novels in the database is nobody's idea of a default.
  const chosen = one(params, "reverse")
  const reverse =
    chosen !== undefined
      ? chosen === "true"
      : sort === "searchrank" || (spec.sorts.find((s) => s.value === sort)?.descending ?? false)

  let results: unknown[] = []
  let count = 0
  let failure: string | null = null

  try {
    const answer = await list<unknown>(spec.type, {
      fields: spec.fields,
      page,
      limit: PAGE_SIZE,
      sort,
      reverse,
      filters,
    })
    results = answer.results
    count = answer.count
  } catch (e) {
    // What the reader typed can be wrong -- an unknown filter, a malformed
    // value -- and the API says which. Anything else is ours and is not the
    // reader's to read.
    failure = e instanceof ApiError && e.status === 400 ? e.message : "Something went wrong."
  }

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-4 py-4 pb-12 animate-slide-up-fade">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="text-xl font-bold sm:text-2xl">
          {spec.label}
          {!failure && (
            <span className="ml-2 text-sm font-normal text-muted tabular-nums">
              {count.toLocaleString()}
            </span>
          )}
        </h1>
        <SearchBox path={path} params={params} initial={search} />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <SortLinks
          path={path}
          params={params}
          sorts={spec.sorts}
          active={sort}
          reverse={reverse}
        />
        <PrefsControls />
      </div>

      {failure ? (
        <p className="rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2 text-sm text-red-300">
          {failure}
        </p>
      ) : results.length === 0 ? (
        <p className="py-12 text-center text-sm text-muted">
          Nothing matched.{" "}
          {search && (
            <a href={withParams(path, params, { search: null, page: null })} className="text-accent hover:underline">
              Clear the search
            </a>
          )}
        </p>
      ) : (
        <>
          <Results type={type} rows={results} />
          <Pagination
            path={path}
            params={params}
            page={page}
            count={count}
            pageSize={PAGE_SIZE}
          />
        </>
      )}
    </div>
  )
}

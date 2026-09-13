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

import { FILTERS } from "@/lib/filters"
import { withParams, type Params } from "@/lib/href"
import { LIST } from "@/lib/list"
import { fetchResults } from "@/lib/results"
import { PrefsControls } from "@/components/ui/PrefsControls"
import { FilterBar } from "./FilterBar"
import { ResultsPanel } from "./ResultsPanel"
import { SearchBox } from "./SearchBox"

/** Reserved by the API for itself; everything else in the query is a filter. */
const RESERVED = new Set(["fields", "sort", "reverse", "page", "limit"])

export function filtersOf(params: Params): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [key, value] of Object.entries(params)) {
    if (RESERVED.has(key)) continue
    const single = Array.isArray(value) ? value[0] : value
    if (single) out[key] = single
  }
  return out
}

export async function ListPage({ type, params }: { type: string; params: Params }) {
  const path = `/${type}`
  const filters = filtersOf(params)
  const search = filters.search ?? ""
  const data = await fetchResults(type, params, filters)

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-4 py-4 pb-12 animate-slide-up-fade">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="text-xl font-bold sm:text-2xl">
          {LIST[type].label}
          {!data.failure && (
            <span className="ml-2 text-sm font-normal tabular-nums text-muted">
              {data.count.toLocaleString()}
            </span>
          )}
        </h1>
        <SearchBox path={path} params={params} initial={search} />
      </div>

      <FilterBar path={path} params={params} filters={FILTERS[type] ?? []} />

      <ResultsPanel
        type={type}
        path={path}
        params={params}
        data={data}
        action={<PrefsControls />}
        empty={
          <>
            Nothing matched.{" "}
            {search && (
              <a
                href={withParams(path, params, { search: null, page: null })}
                className="text-accent hover:underline"
              >
                Clear the search
              </a>
            )}
          </>
        }
      />
    </div>
  )
}

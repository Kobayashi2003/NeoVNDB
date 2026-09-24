/** A listing of one type. All state is in the address; every parameter the
 *  API does not reserve (f= included) is passed through as a filter. */

import { FILTERS } from "@/lib/filters"
import { withParams, type Params } from "@/lib/href"
import { LIST } from "@/lib/list"
import { fetchResults } from "@/lib/results"
import { DataAge } from "@/components/layout/DataAge"
import { FilterBar } from "./FilterBar"
import { ResultsPanel } from "./ResultsPanel"
import { SearchBox } from "./SearchBox"

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
    <div className="mx-auto flex w-full max-w-page flex-col gap-4 px-4 py-4 pb-12 animate-slide-up-fade">
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

      <FilterBar
        type={type}
        path={path}
        params={params}
        filters={FILTERS[type] ?? []}
        sort={{ sorts: LIST[type].sorts, active: data.sort, reverse: data.reverse }}
      />

      <ResultsPanel
        type={type}
        path={path}
        params={params}
        data={data}
        sortMenu={false}
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

      <DataAge />
    </div>
  )
}

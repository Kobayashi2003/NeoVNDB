/** One page of results, with the controls that move through it.
 *
 *  Shared by the listings and by the four detail pages whose body is a listing
 *  under a filter -- a producer's works, a tag's visual novels, a trait's
 *  characters. They differ in what surrounds the results, not in the results.
 *
 *  `path` is where its links point, which is the page it is embedded in. That
 *  is what lets a detail page keep the promise a listing makes: what you are
 *  looking at is in the address. */

import { LIST, PAGE_SIZE } from "@/lib/list"
import type { Params } from "@/lib/href"
import type { Results as ResultsData } from "@/lib/results"
import { Pagination } from "./Pagination"
import { Results } from "./Results"
import { SortLinks } from "./SortLinks"

export function ResultsPanel({
  type,
  path,
  params,
  data,
  empty = "Nothing matched.",
  action,
}: {
  /** The type letter, which names both the spec and the result shape. */
  type: string
  path: string
  params: Params
  data: ResultsData
  empty?: React.ReactNode
  /** Rendered opposite the sort links -- the reading preferences, or tabs. */
  action?: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SortLinks
          path={path}
          params={params}
          sorts={LIST[type].sorts}
          active={data.sort}
          reverse={data.reverse}
        />
        {action}
      </div>

      {data.failure ? (
        <p className="rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2 text-sm text-red-300">
          {data.failure}
        </p>
      ) : data.rows.length === 0 ? (
        <p className="py-12 text-center text-sm text-muted">{empty}</p>
      ) : (
        <>
          <Results type={type} rows={data.rows} />
          <Pagination
            path={path}
            params={params}
            page={data.page}
            count={data.count}
            pageSize={PAGE_SIZE}
          />
        </>
      )}
    </div>
  )
}

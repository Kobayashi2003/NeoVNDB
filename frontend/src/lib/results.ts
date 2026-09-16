/** Running one page of a search, apart from drawing it.
 *
 *  The count belongs in the heading and the rows belong below the controls,
 *  and those are two different places on the page. Fetching here rather than
 *  inside the panel lets whoever owns the page read the answer once and put
 *  each part of it where it goes. */

import { ApiError, list } from "@/lib/api"
import { one, type Params } from "@/lib/href"
import { LIST, PAGE_SIZE } from "@/lib/list"

export interface Results {
  rows: unknown[]
  count: number
  page: number
  sort: string
  reverse: boolean
  /** What to tell the reader instead of results, when there are none to show
   *  because the request was wrong rather than because nothing matched. */
  failure: string | null
}

export async function fetchResults(
  type: string,
  params: Params,
  filters: Record<string, string>,
  /** What to order by when the reader has not said. The type's own default
   *  suits its listing; a page built around a different question can want a
   *  different answer -- the front page asks what came out, so it starts by
   *  when rather than by how well liked. */
  fallbackSort?: string,
): Promise<Results> {
  const spec = LIST[type]
  const page = Math.max(1, Number(one(params, "page") ?? 1) || 1)
  const search = filters.search ?? ""

  // A search term brings its own order: how well each row matched. Asking for
  // it without one would sort by nothing at all.
  const sort = one(params, "sort") ?? (search ? "searchrank" : (fallbackSort ?? spec.defaultSort))

  // An order that is only interesting from one end starts at that end, whether
  // the reader chose it or arrived at it. Sorting by rating and getting the
  // worst-rated visual novels in the database is nobody's idea of a default.
  const chosen = one(params, "reverse")
  const reverse =
    chosen !== undefined
      ? chosen === "true"
      : sort === "searchrank" || (spec.sorts.find((s) => s.value === sort)?.descending ?? false)

  try {
    const answer = await list<unknown>(spec.type, {
      fields: spec.fields,
      page,
      limit: PAGE_SIZE,
      sort,
      reverse,
      filters,
    })
    return { rows: answer.results, count: answer.count, page, sort, reverse, failure: null }
  } catch (e) {
    // What the reader asked for can be wrong -- an unknown filter, a malformed
    // value -- and the API says which. Anything else is ours and is not the
    // reader's to read.
    const failure =
      e instanceof ApiError && e.status === 400 ? e.message : "Something went wrong."
    return { rows: [], count: 0, page, sort, reverse, failure }
  }
}

/** How many rows a query would return, without drawing any of them. A detail
 *  page labels its tabs with this before the reader opens them. */
export async function countOf(type: string, filters: Record<string, string>): Promise<number> {
  try {
    const answer = await list<unknown>(LIST[type].type, { fields: "id", limit: 1, filters })
    return answer.count
  } catch {
    // A tab with an unknown count is a tab without a number on it, which is
    // better than a page that will not render.
    return 0
  }
}

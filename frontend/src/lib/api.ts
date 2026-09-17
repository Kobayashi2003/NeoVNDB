/** The one place that talks to the API. Callers name the fields they want;
 *  nothing is fetched that a page did not ask for. */

/** Through the edge, like everything else -- including from the server, where
 *  a direct hop to the service would be shorter. Going around it would mean
 *  the pages exercise a route surface no browser can reach, so the first thing
 *  to find a gap in the edge's allowlist would be a deployment rather than a
 *  page load.
 *
 *  A path in the browser and an address on the server. The browser resolves it
 *  against whatever name the page was served under, which is the only answer
 *  that is right for every reader; Node has no such origin to resolve against,
 *  so there it has to be told one. */
const BASE =
  typeof window === "undefined"
    ? (process.env.NEOVNDB_API_BASE ?? "http://127.0.0.1:5090/vndbserve")
    : "/vndbserve"

export interface Page<T> {
  results: T[]
  count: number
  more: boolean
}

class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
    this.name = "ApiError"
  }
}

async function get<T>(path: string, params: Record<string, string>): Promise<T> {
  const url = `${BASE}${path}?${new URLSearchParams(params)}`
  const res = await fetch(url, { next: { revalidate: 60 } })
  const body = await res.json().catch(() => null)

  if (!res.ok) {
    // The API reports what a caller can fix in `error`; anything else is ours.
    throw new ApiError(res.status, body?.error ?? `${res.status} from ${path}`)
  }
  return body as T
}

/** byId returns the single entity, or null when the id matches nothing. */
export async function byId<T>(type: string, id: string, fields: string): Promise<T | null> {
  const page = await get<Page<T>>(`/${type}`, { id, fields, limit: "1" })
  return page.results[0] ?? null
}

/** list runs one page of a search.
 *
 *  `filters` is passed through as it arrives. Everything the API does not
 *  reserve for itself is a filter, so a query string a reader can edit is a
 *  query the API can answer -- which is the point of having built it that way.
 *  A filter it does not know is a 400 with a message saying so, and that is
 *  the right answer rather than something to hide here. */
export async function list<T>(
  type: string,
  opts: {
    fields: string
    page?: number
    limit?: number
    sort?: string
    reverse?: boolean
    filters?: Record<string, string>
  },
): Promise<Page<T>> {
  const params: Record<string, string> = { ...opts.filters, fields: opts.fields }
  if (opts.page && opts.page > 1) params.page = String(opts.page)
  if (opts.limit) params.limit = String(opts.limit)
  if (opts.sort) params.sort = opts.sort
  if (opts.reverse) params.reverse = "true"
  return get<Page<T>>(`/${type}`, params)
}

/** The relation graph, which is a shape of its own rather than a page of rows
 *  -- so it has its own route on the API and its own call here. */
export async function relationGraph<T>(id: string, depth: number): Promise<T> {
  return get<T>(`/vn/${id}/relations`, { depth: String(depth) })
}

export { ApiError }

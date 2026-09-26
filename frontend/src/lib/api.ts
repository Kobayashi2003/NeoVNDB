/** The read API client. */

/** Through the edge even on the server, so pages exercise the same allowlist
 *  browsers do. A path in the browser; Node has no origin, so an address. */
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
    throw new ApiError(res.status, body?.error ?? `${res.status} from ${path}`)
  }
  return body as T
}

/** Null rather than a throw, so a page never fails over its date line. */
export async function generation(): Promise<Generation | null> {
  try {
    return await get<Generation>("/meta/generation", {})
  } catch {
    return null
  }
}

export interface Generation {
  /** The dump's own date, as vndb numbers it: 20260907. */
  code: string
  imported_at: string
  published_at: string
}

/** byId returns the single entity, or null when the id matches nothing. */
export async function byId<T>(type: string, id: string, fields: string): Promise<T | null> {
  const page = await get<Page<T>>(`/${type}`, { id, fields, limit: "1" })
  return page.results[0] ?? null
}

/** One page of a search. `filters` pass through unchecked; the API rejects
 *  unknown ones with a readable 400. */
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

export interface LinkSite {
  site: string
  label: string
  /** The type letters the site appears on, e.g. "ps". */
  entities: string
}

/** The link sites the extlink filter accepts. */
export async function linkSites(): Promise<LinkSite[]> {
  return (await get<{ results: LinkSite[] }>("/meta/extlinks", {})).results
}

export async function relationGraph<T>(id: string, depth: number): Promise<T> {
  return get<T>(`/vn/${id}/relations`, { depth: String(depth) })
}

/** The read API's description of itself (OpenAPI 3.1), built by the API from
 *  the tables that serve requests. Only the parts the /api page reads. */
export interface OpenAPI {
  info: { title: string; version: string; description: string }
  servers: { url: string }[]
  paths: Record<string, { get: Operation }>
  components: { schemas: Record<string, { properties: Record<string, FieldSchema> }> }
}

export interface Operation {
  summary: string
  parameters?: {
    name: string
    in: string
    description?: string
    "x-filter"?: boolean
    schema?: { enum?: string[] }
  }[]
}

export interface FieldSchema {
  $ref?: string
  "x-expected"?: number
  "x-subfields"?: string[]
  "x-edge"?: string[]
}

export async function openapi(): Promise<OpenAPI> {
  return get<OpenAPI>("/meta/openapi", {})
}

export { ApiError }

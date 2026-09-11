/** The one place that talks to the API. Callers name the fields they want;
 *  nothing is fetched that a page did not ask for. */

const BASE = process.env.NEXT_PUBLIC_API ?? "http://127.0.0.1:5100"

export interface Page<T> {
  results: T[]
  count: number
  more: boolean
}

class ApiError extends Error {
  constructor(readonly status: number, message: string) {
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

export { ApiError }

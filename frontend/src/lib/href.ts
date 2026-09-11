/** Building the next URL from the current one.
 *
 *  A list page keeps its whole state in the query string: which page, which
 *  order, what was searched for, and every filter the API understands. So
 *  every control on it is a link, and every link is this one edit -- change
 *  these keys, keep the rest, drop what has gone back to its default. */

export type Params = Record<string, string | string[] | undefined>

/** A value of null removes the key. */
export function withParams(
  path: string,
  current: Params,
  changes: Record<string, string | number | null>,
): string {
  const next = new URLSearchParams()
  for (const [key, value] of Object.entries(current)) {
    if (key in changes) continue
    if (typeof value === "string" && value !== "") next.set(key, value)
    // A repeated key is not something any control here produces; the first
    // wins rather than the query silently carrying both.
    else if (Array.isArray(value) && value[0]) next.set(key, value[0])
  }
  for (const [key, value] of Object.entries(changes)) {
    if (value !== null && value !== "") next.set(key, String(value))
  }
  const query = next.toString()
  return query ? `${path}?${query}` : path
}

/** The single value of a query parameter, ignoring a repeat. */
export function one(params: Params, key: string): string | undefined {
  const value = params[key]
  return Array.isArray(value) ? value[0] : value
}

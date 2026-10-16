/** Building the next URL from the current one: change some keys, keep the rest. */

export type Params = Record<string, string | string[] | undefined>;

/** A value of null removes the key. */
export function withParams(
  path: string,
  current: Params,
  changes: Record<string, string | number | null>,
): string {
  const next = new URLSearchParams();
  for (const [key, value] of Object.entries(current)) {
    if (key in changes) continue;
    if (typeof value === 'string' && value !== '') next.set(key, value);
    // A repeated key: the first wins.
    else if (Array.isArray(value) && value[0]) next.set(key, value[0]);
  }
  for (const [key, value] of Object.entries(changes)) {
    if (value !== null && value !== '') next.set(key, String(value));
  }
  const query = next.toString();
  return query ? `${path}?${query}` : path;
}

/** Parameters the API reads as paging and shape rather than filters. */
const RESERVED = new Set(['fields', 'sort', 'reverse', 'page', 'limit']);

/** A listing's address as API filters: every parameter the API does not
 *  reserve, f= included. */
export function filtersOf(params: Params): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(params)) {
    if (RESERVED.has(key)) continue;
    const single = Array.isArray(value) ? value[0] : value;
    if (single) out[key] = single;
  }
  return out;
}

/** The single value of a query parameter, ignoring a repeat. */
export function one(params: Params, key: string): string | undefined {
  const value = params[key];
  return Array.isArray(value) ? value[0] : value;
}

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

/** The single value of a query parameter, ignoring a repeat. */
export function one(params: Params, key: string): string | undefined {
  const value = params[key];
  return Array.isArray(value) ? value[0] : value;
}

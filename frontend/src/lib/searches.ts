/** A listing's search as something to keep: the query of its address, and
 *  this device's recent ones. Named searches live on the account
 *  (lib/user.ts); the recent ones only here. */

import type { Params } from './href';

/** Where the reader is in a listing, not what they asked for. */
const PLACE = new Set(['page', 'limit']);

/** The query that reproduces a listing, without the ?. Keys in a fixed order,
 *  so the same search reads the same however its address was built; empty when
 *  nothing narrows or orders it. */
export function queryOf(params: Params): string {
  const kept: [string, string][] = [];
  for (const [key, value] of Object.entries(params)) {
    if (PLACE.has(key)) continue;
    const single = Array.isArray(value) ? value[0] : value;
    if (single) kept.push([key, single]);
  }
  kept.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return new URLSearchParams(kept).toString();
}

/** The query as a line a reader can scan: the search words first, then each
 *  parameter as it is written. */
export function describe(query: string): string {
  const params = new URLSearchParams(query);
  const words = params.get('search');
  const rest = [...params].filter(([key]) => key !== 'search').map(([k, v]) => `${k}=${v}`);
  return [words && `“${words}”`, ...rest].filter(Boolean).join(' · ');
}

const RECENT = (type: string) => `neovndb:recent:${type}`;
const KEEP = 8;

/** This device's recent searches of a type, newest first. */
export function recent(type: string): string[] {
  try {
    const saved: unknown = JSON.parse(window.localStorage.getItem(RECENT(type)) ?? '[]');
    return Array.isArray(saved) ? saved.filter((q): q is string => typeof q === 'string') : [];
  } catch {
    return [];
  }
}

/** Puts a search at the front, once. */
export function remember(type: string, query: string): void {
  if (!query) return;
  const next = [query, ...recent(type).filter(q => q !== query)].slice(0, KEEP);
  try {
    window.localStorage.setItem(RECENT(type), JSON.stringify(next));
  } catch {
    // A convenience; without storage there is simply no history.
  }
}

export function forgetRecent(type: string): void {
  try {
    window.localStorage.removeItem(RECENT(type));
  } catch {
    // As above.
  }
}

/** A listing's search as something to keep: the query of its address, and
 *  this device's recent ones. Named searches live on the account
 *  (lib/user.ts); the recent ones only here. */

import type { Params } from './href';
import { textKey } from './list';

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

/** The filters a search of descriptions writes, a release's and the rest's. */
const TEXT_KEYS = [textKey('v'), textKey('r')];

/** The query as a line a reader can scan: the search words first, then each
 *  parameter as it is written. */
export function describe(query: string): string {
  const params = new URLSearchParams(query);
  const words = params.get('search');
  // What the search box's other side writes, said as words too.
  const text = TEXT_KEYS.map(k => [k, params.get(k)] as const).find(([, v]) => v);
  const rest = [...params]
    .filter(([key]) => key !== 'search' && !TEXT_KEYS.includes(key))
    .map(([k, v]) => `${k}=${v}`);
  return [words && `“${words}”`, text && `${text[0]} “${text[1]}”`, ...rest]
    .filter(Boolean)
    .join(' · ');
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

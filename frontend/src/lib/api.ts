/** The read API client. */

/** Through the edge even on the server, so pages exercise the same allowlist
 *  browsers do. A path in the browser; Node has no origin, so an address. */
const BASE =
  typeof window === 'undefined'
    ? (process.env.NEOVNDB_API_BASE ?? 'http://127.0.0.1:17030/vndbserve')
    : '/vndbserve';

export interface Page<T> {
  results: T[];
  count: number;
  more: boolean;
}

class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function get<T>(path: string, params: Record<string, string>): Promise<T> {
  const url = `${BASE}${path}?${new URLSearchParams(params)}`;
  const res = await fetch(url, { next: { revalidate: 60 } });
  const body = await res.json().catch(() => null);

  if (!res.ok) {
    throw new ApiError(res.status, body?.error ?? `${res.status} from ${path}`);
  }
  return body as T;
}

/** Null rather than a throw, so a page never fails over its date line. */
export async function generation(): Promise<Generation | null> {
  try {
    return await get<Generation>('/meta/generation', {});
  } catch {
    return null;
  }
}

export interface Generation {
  /** The dump's own date, as vndb numbers it: 20260907. */
  code: string;
  imported_at: string;
  /** Null for an archive imported from a file rather than downloaded. */
  published_at: string | null;
}

/** byId returns the single entity, or null when the id matches nothing. */
export async function byId<T>(type: string, id: string, fields: string): Promise<T | null> {
  const page = await get<Page<T>>(`/${type}`, { id, fields, limit: '1' });
  return page.results[0] ?? null;
}

/** One page of a search. `filters` pass through unchecked; the API rejects
 *  unknown ones with a readable 400. */
export async function list<T>(
  type: string,
  opts: {
    fields: string;
    page?: number;
    limit?: number;
    sort?: string;
    reverse?: boolean;
    filters?: Record<string, string>;
  },
): Promise<Page<T>> {
  const params: Record<string, string> = { ...opts.filters, fields: opts.fields };
  if (opts.page && opts.page > 1) params.page = String(opts.page);
  if (opts.limit) params.limit = String(opts.limit);
  if (opts.sort) params.sort = opts.sort;
  if (opts.reverse) params.reverse = 'true';
  return get<Page<T>>(`/${type}`, params);
}

/** How many results each of `values` would leave if chosen for `filter`,
 *  under the rest of `filters` (the filter's own value is set aside). */
export async function facet(
  type: string,
  filter: string,
  values: string[],
  filters: Record<string, string>,
): Promise<Record<string, number>> {
  const answer = await get<{ counts: Record<string, number> }>(`/facets/${type}/${filter}`, {
    ...filters,
    values: values.join(','),
  });
  return answer.counts;
}

export interface Tally {
  id: string;
  name: string;
  original: string | null;
  count: number;
}

export interface TagTally {
  id: string;
  name: string;
  translation: string | null;
  count: number;
  /** How strongly, on average: vndb's 0-3. */
  rating: number;
}

/** What a set of visual novels has in common (`/stats/vn`). */
export interface VNStats {
  count: number;
  developers: Tally[];
  publishers: Tally[];
  /** By credited role: scenario, chardesign, art, music, songs, director, ... */
  staff: Record<string, Tally[]>;
  /** By tag category: cont, ero, tech. */
  tags: Record<string, TagTally[]>;
}

/** Counts over these titles (at most the API's id ceiling), `top` of each. */
export async function vnStats(ids: string[], top: number): Promise<VNStats> {
  return get<VNStats>('/stats/vn', { id: ids.join(','), top: String(top) });
}

/** One value of a field across the database, and how many entries hold it. */
export interface Counted {
  key: string;
  count: number;
}

/** Counts per character sex: f, m, b (both), n (sexless), u (not given). */
export type BySex = Record<string, Counted[]>;

/** A title, producer, person, tag or trait, and what it is counted against. */
export interface Leader {
  id: string;
  name: string;
  original: string | null;
  translation?: string;
  count: number;
}

/** The whole database counted (`/stats`, backend db.SiteStats). */
export interface SiteStats {
  totals: Counted[];
  /** Entries created on vndb per month (YYYY-MM), by type letter. */
  added: Record<string, Counted[]>;
  vn_years: Counted[];
  vn_languages: Counted[];
  vn_platforms: Counted[];
  vn_lengths: Counted[];
  vn_status: Counted[];
  /** By half point, keyed ×10: 65 is 6.5 to 6.99. */
  vn_ratings: Counted[];
  /** `count` is the rating ×100. */
  vn_top_rated: Leader[];
  vn_most_voted: Leader[];
  release_years: Counted[];
  release_platforms: Counted[];
  release_languages: Counted[];
  release_ages: Counted[];
  release_voiced: Counted[];
  release_kinds: Counted[];
  release_engines: Counted[];
  developers: Leader[];
  publishers: Leader[];
  producer_types: Counted[];
  producer_languages: Counted[];
  char_sex: Counted[];
  char_gender: Counted[];
  char_roles: BySex;
  char_ages: BySex;
  /** Centimetres. */
  char_heights: BySex;
  char_bust: BySex;
  char_cups: BySex;
  char_blood: BySex;
  char_birth_months: BySex;
  staff_gender: Counted[];
  staff_languages: Counted[];
  staff_roles: Counted[];
  staff_top: Record<string, Leader[]>;
  seiyuu: Leader[];
  tag_categories: Counted[];
  tags: Record<string, Leader[]>;
  trait_groups: Leader[];
  /** Keyed by the group's id, as in trait_groups. */
  traits: Record<string, Leader[]>;
}

export interface CountedSite {
  /** The generation it was counted on: the dump's code, then the translations'. */
  generation: string;
  counted_at: string;
  stats: SiteStats;
}

/** Counted once per dump, ahead of the first ask. */
export async function siteStats(): Promise<CountedSite> {
  return get<CountedSite>('/stats', {});
}

export interface Pick {
  id: string;
  score: number;
  /** The titles it came from, most telling first. */
  because: string[];
}

/** Titles alike to `from` (each with a weight; below zero pushes away), none
 *  of `exclude`. */
export async function recommend(
  from: { id: string; weight: number }[],
  exclude: string[],
  limit: number,
): Promise<Pick[]> {
  const answer = await get<{ results: Pick[] }>('/recommend/vn', {
    from: from.map(f => `${f.id}:${f.weight}`).join(','),
    exclude: exclude.join(','),
    limit: String(limit),
  });
  return answer.results;
}

export interface LinkSite {
  site: string;
  label: string;
  /** The type letters the site appears on, e.g. "ps". */
  entities: string;
}

/** The link sites the extlink filter accepts. */
export async function linkSites(): Promise<LinkSite[]> {
  return (await get<{ results: LinkSite[] }>('/meta/extlinks', {})).results;
}

export async function relationGraph<T>(id: string, depth: number): Promise<T> {
  return get<T>(`/vn/${id}/relations`, { depth: String(depth) });
}

/** The read API's description of itself (OpenAPI 3.1), built by the API from
 *  the tables that serve requests. Only the parts the /api page reads. */
export interface OpenAPI {
  info: { title: string; version: string; description: string };
  servers: { url: string }[];
  paths: Record<string, { get: Operation }>;
  components: { schemas: Record<string, { properties: Record<string, FieldSchema> }> };
}

export interface Operation {
  summary: string;
  parameters?: {
    name: string;
    in: string;
    description?: string;
    'x-filter'?: boolean;
    schema?: { enum?: string[] };
  }[];
}

export interface FieldSchema {
  $ref?: string;
  'x-expected'?: number;
  'x-subfields'?: string[];
  'x-edge'?: string[];
}

export async function openapi(): Promise<OpenAPI> {
  return get<OpenAPI>('/meta/openapi', {});
}

export { ApiError };

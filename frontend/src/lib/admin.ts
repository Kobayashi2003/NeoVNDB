/** The admin routes of the three services. Browser-only, like lib/user.ts:
 *  the edge lets a request through only with an administrator's cookie. */
import { UserError } from '@/lib/user';

async function call<T>(base: string, method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(base + path, {
    method,
    credentials: 'same-origin',
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (res.status === 204) return undefined as T;

  const answer = (await res.json().catch(() => null)) as { error?: string } | null;
  if (!res.ok) {
    throw new UserError(res.status, answer?.error ?? `${res.status} from ${path}`);
  }
  return answer as T;
}

const mirror = <T>(method: string, path: string, body?: unknown) =>
  call<T>('/vndbserve', method, path, body);
const images = <T>(method: string, path: string, body?: unknown) =>
  call<T>('/imgserve', method, path, body);
const users = <T>(method: string, path: string, body?: unknown) =>
  call<T>('/userserve', method, path, body);

/** A long task on a schedule, as a service reports it. */
export interface Job<R = unknown> {
  running: boolean;
  started_at: string | null;
  finished_at: string | null;
  error?: string;
  result?: R;
  next_at: string | null;
  output: string[];
}

export interface MirrorStatus {
  database: { server: string; bytes: number };
  generations: {
    schema: string;
    code: string;
    published_at: string | null;
    started_at: string;
    finished_at: string | null;
  }[];
  ddl_stale: boolean;
  archives: { name: string; bytes: number }[] | null;
  dump_keep: number;
  update: Job;
  schedule: { every: string; retry_after: string };
  translations: { lang: string; terms: number; passages: number };
}

export interface CrawlReport {
  known: number;
  held: number;
  fetched: number;
  left: number;
}

export interface ImageStatus {
  crawl: Job<CrawlReport>;
  schedule: { every: string; per_run: number; delay: string };
}

export interface Backups {
  results: { name: string; bytes: number; taken: string }[];
  every: string;
  check_every: string;
  keep: number;
}

export interface Account {
  id: number;
  username: string;
  email: string | null;
  is_admin: boolean;
  created_at: string;
  lists: number;
  items: number;
  ratings: number;
  sessions: number;
  last_seen: string | null;
}

export interface Translatable {
  id: number;
  name: string;
  description: string;
  group?: string;
  items: number;
  name_to: string;
  description_to: string;
}

export interface TranslatablePage {
  results: Translatable[];
  count: number;
  page_size: number;
  total: number;
  missing_names: number;
  missing_descriptions: number;
}

export type Category = 'tag' | 'trait';

export const mirrorStatus = () => mirror<MirrorStatus>('GET', '/admin/status');
export const startUpdate = () => mirror<Job>('POST', '/admin/update');
export const rollback = () => mirror<{ live: string }>('POST', '/admin/rollback');

export function translatable(category: Category, page: number, missing: boolean, q: string) {
  const params = new URLSearchParams({ category, page: String(page) });
  if (missing) params.set('missing', 'true');
  if (q) params.set('q', q);
  return mirror<TranslatablePage>('GET', `/admin/trans?${params}`);
}

/** An empty target removes the translation. */
export const translate = (
  category: Category,
  id: number,
  field: 'name' | 'description',
  target: string,
) => mirror<void>('PUT', '/admin/trans', { category, id, field, target });

/** Downloaded by the browser, not fetched: it is a file to keep. */
export const EXPORT_URL = '/vndbserve/admin/trans/export';

export const imageStatus = () => images<ImageStatus>('GET', '/admin/status');
export const startCrawl = () => images<Job<CrawlReport>>('POST', '/admin/crawl');

export const backups = () => users<Backups>('GET', '/admin/backups');
export const backUp = () => users<Backups>('POST', '/admin/backups');

export const accounts = () =>
  users<{ results: Account[] }>('GET', '/admin/users').then(r => r.results);
export const setAdmin = (id: number, isAdmin: boolean) =>
  users<void>('PATCH', `/admin/users/${id}`, { is_admin: isAdmin });
export const signOutAccount = (id: number) => users<void>('POST', `/admin/users/${id}/logout`);
export const deleteAccountAsAdmin = (id: number) => users<void>('DELETE', `/admin/users/${id}`);

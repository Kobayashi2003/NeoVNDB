/** The user service client. Browser-only: server-rendered pages stay the same
 *  for every reader, so they can be cached. Same origin, so the cookie rides. */

const BASE = "/userserve"

export interface User {
  id: number
  username: string
  email: string | null
  is_admin: boolean
  created_at: string
}

export interface Collection {
  id: number
  /** One of vndb's seven letters; a list holds one kind of thing. */
  type: string
  name: string
  count: number
  created_at: string
}

/** The service's messages are written for the reader and shown as-is. */
export class UserError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
    this.name = "UserError"
  }
}

/** What to show for a failed call: the service's own words when it gave any. */
export function errorText(err: unknown): string {
  return err instanceof UserError ? err.message : "Something went wrong."
}

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(BASE + path, {
    method,
    credentials: "same-origin",
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  if (res.status === 204) return undefined as T

  const answer = (await res.json().catch(() => null)) as { error?: string } | null
  if (!res.ok) {
    throw new UserError(res.status, answer?.error ?? "Something went wrong.")
  }
  return answer as T
}

/** Who is signed in, or null. */
export const session = () => call<{ user: User | null }>("GET", "/session").then((r) => r.user)

export const login = (username: string, password: string) =>
  call<User>("POST", "/login", { username, password })

/** An empty email registers without one. */
export const register = (username: string, password: string, email: string) =>
  call<User>("POST", "/register", { username, password, email })

export const logout = () => call<void>("POST", "/logout")

export const logoutEverywhere = () => call<void>("POST", "/logout-everywhere")

export const changePassword = (current: string, next: string) =>
  call<void>("POST", "/me/password", { current, new: next })

/** Everything goes with it: sessions, lists, marks, ratings. */
export const deleteAccount = (password: string) => call<void>("POST", "/me/delete", { password })

export const collections = (type?: string) =>
  call<{ results: Collection[] }>("GET", type ? `/collections?type=${type}` : "/collections").then(
    (r) => r.results,
  )

export const createCollection = (type: string, name: string) =>
  call<Collection>("POST", "/collections", { type, name })

/** Which of the reader's lists hold this item. */
export const holding = (item: string) =>
  call<{ collections: number[] }>("GET", `/holding/${item}`).then((r) => r.collections)

export interface Mark {
  id: string
  marked_at: string
  /** The reader's rating of the item, given anywhere; null if none. */
  rating: number | null
}

/** An order the user service puts things in itself, from what only it
 *  knows. Each runs newest or highest first unless `ascending`. */
export interface OwnOrder {
  sort: string
  ascending: boolean
}

function ordered(o: OwnOrder): string {
  return `sort=${o.sort}${o.ascending ? "&reverse=true" : ""}`
}

/** One page of a list, by "added" or "rating". */
export const marks = (list: number, order: OwnOrder, page: number, limit: number) =>
  call<{ results: Mark[]; count: number; more: boolean }>(
    "GET",
    `/collections/${list}/marks?${ordered(order)}&page=${page}&limit=${limit}`,
  )

export const renameCollection = (list: number, name: string) =>
  call<void>("PATCH", `/collections/${list}`, { name })

export const deleteCollection = (list: number) => call<void>("DELETE", `/collections/${list}`)

/** Idempotent, so a double click is harmless. */
export const addMark = (list: number, item: string) =>
  call<void>("PUT", `/collections/${list}/marks/${item}`)

export const removeMark = (list: number, item: string) =>
  call<void>("DELETE", `/collections/${list}/marks/${item}`)

/** Every item on a list, in order, so the read API can sort or search them.
 *  Fewer items than `count` means the list is too long for that. */
export const items = (list: number, order: OwnOrder) =>
  call<{ items: Mark[]; count: number }>("GET", `/collections/${list}/items?${ordered(order)}`)

/** `changed` counts only what was new; the rest were already there. */
export const addMarks = (list: number, items: string[]) =>
  call<{ changed: number }>("POST", `/collections/${list}/marks/add`, { items })

/** `changed` can be less than asked when the page is out of date. */
export const removeMarks = (list: number, items: string[]) =>
  call<{ changed: number }>("POST", `/collections/${list}/marks/remove`, { items })

export const moveMarks = (from: number, to: number, items: string[]) =>
  call<{ changed: number }>("POST", `/collections/${from}/marks/move`, { items, to })

/** 1-5 or null; per item, not per list. */
export const rating = (item: string) =>
  call<{ rating: number | null }>("GET", `/ratings/${item}`).then((r) => r.rating)

export const setRating = (item: string, value: number) =>
  call<void>("PUT", `/ratings/${item}`, { rating: value })

export const clearRating = (item: string) => call<void>("DELETE", `/ratings/${item}`)

export interface Rated {
  id: string
  rating: number
  rated_at: string
}

/** One page of the reader's ratings of one type, by "rating" or "rated". */
export const ratings = (type: string, order: OwnOrder, page: number, limit: number) =>
  call<{ results: Rated[]; count: number; more: boolean }>(
    "GET",
    `/ratings?type=${type}&${ordered(order)}&page=${page}&limit=${limit}`,
  )

/** Every rating of one type, as `items` is for a list. */
export const ratedItems = (type: string, order: OwnOrder) =>
  call<{ items: Rated[]; count: number }>("GET", `/ratings/items?type=${type}&${ordered(order)}`)

/** How many of each type the reader rated, by type letter. */
export const ratingCounts = () =>
  call<{ counts: Record<string, number> }>("GET", "/ratings/counts").then((r) => r.counts)

/** One rating for all of them, rated before or not; all of one type. */
export const setRatings = (items: string[], value: number) =>
  call<{ changed: number }>("POST", "/ratings/set", { items, rating: value })

export const clearRatings = (items: string[]) =>
  call<{ changed: number }>("POST", "/ratings/clear", { items })

/** Mirrors the service's validation. */
export const RULES = {
  username: "2 to 32 characters: letters, digits, - and _",
  password: "8 to 72 characters (fewer outside ASCII)",
  listName: 64,
} as const

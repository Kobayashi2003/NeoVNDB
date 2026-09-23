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

export const me = () => call<User>("GET", "/me")

export const login = (username: string, password: string) =>
  call<User>("POST", "/login", { username, password })

/** An empty email registers without one. */
export const register = (username: string, password: string, email: string) =>
  call<User>("POST", "/register", { username, password, email })

export const logout = () => call<void>("POST", "/logout")

export const logoutEverywhere = () => call<void>("POST", "/logout-everywhere")

export const changePassword = (current: string, next: string) =>
  call<void>("POST", "/me/password", { current, new: next })

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
}

/** Newest first. */
export const marks = (list: number, page: number, limit: number) =>
  call<{ results: Mark[]; count: number; more: boolean }>(
    "GET",
    `/collections/${list}/marks?page=${page}&limit=${limit}`,
  )

export const renameCollection = (list: number, name: string) =>
  call<void>("PATCH", `/collections/${list}`, { name })

export const deleteCollection = (list: number) => call<void>("DELETE", `/collections/${list}`)

/** Idempotent, so a double click is harmless. */
export const addMark = (list: number, item: string) =>
  call<void>("PUT", `/collections/${list}/marks/${item}`)

export const removeMark = (list: number, item: string) =>
  call<void>("DELETE", `/collections/${list}/marks/${item}`)

/** Every id on a list, so the read API can sort or search it. Fewer items
 *  than `count` means the list is too long for that; only saved order works. */
export const items = (list: number) =>
  call<{ items: string[]; count: number }>("GET", `/collections/${list}/items`)

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

/** Mirrors the service's validation. */
export const RULES = {
  username: "2 to 32 characters: letters, digits, - and _",
  password: "at least 8 characters",
  listName: 64,
} as const

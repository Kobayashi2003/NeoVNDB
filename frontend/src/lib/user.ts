/** The one place that talks to the user service.
 *
 *  Everything here runs in the browser and nowhere else. A mirror page is the
 *  same page for every reader, and is rendered and cached on that basis; who
 *  is reading it is asked afterwards, by the page itself, so that knowing the
 *  answer never makes a page unshareable. Reading the session on the server
 *  would turn every route into a per-reader one and throw that away.
 *
 *  Which is also why this is a path and not an address: same origin as the
 *  page, so the session cookie rides along with nothing arranged. */

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
  /** One of vndb's seven letters. A list holds one kind of thing, which is
   *  why the button on a page only ever offers that page's own lists. */
  type: string
  name: string
  count: number
  created_at: string
}

/** What the service said went wrong. Its messages are written to be read by
 *  the person who caused them, so they are shown rather than replaced. */
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
    // The default, said out loud: the whole design rests on the cookie going.
    credentials: "same-origin",
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  // Everything that changes something answers 204 and says nothing.
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

/** An empty email is no email: the service takes the account without one. */
export const register = (username: string, password: string, email: string) =>
  call<User>("POST", "/register", { username, password, email })

export const logout = () => call<void>("POST", "/logout")

export const logoutEverywhere = () => call<void>("POST", "/logout-everywhere")

export const changePassword = (current: string, next: string) =>
  call<void>("POST", "/me/password", { current, new: next })

/* --- The lists a reader keeps --------------------------------------------- */

/** The reader's lists: one type's, or every one they keep. */
export const collections = (type?: string) =>
  call<{ results: Collection[] }>("GET", type ? `/collections?type=${type}` : "/collections").then(
    (r) => r.results,
  )

export const createCollection = (type: string, name: string) =>
  call<Collection>("POST", "/collections", { type, name })

/** Which of the reader's lists hold this item. What a detail page asks. */
export const holding = (item: string) =>
  call<{ collections: number[] }>("GET", `/holding/${item}`).then((r) => r.collections)

export interface Mark {
  /** The full vndb id, which is what the read API is handed to turn a list
   *  back into things. */
  id: string
  marked_at: string
}

/** One page of what a list holds, newest first. The size is named so that a
 *  collection pages like every other listing on the site rather than at
 *  whatever the service happens to default to. */
export const marks = (list: number, page: number, limit: number) =>
  call<{ results: Mark[]; count: number; more: boolean }>(
    "GET",
    `/collections/${list}/marks?page=${page}&limit=${limit}`,
  )

export const renameCollection = (list: number, name: string) =>
  call<void>("PATCH", `/collections/${list}`, { name })

export const deleteCollection = (list: number) => call<void>("DELETE", `/collections/${list}`)

/** Both are idempotent at the service, so a double click is not an error. */
export const addMark = (list: number, item: string) =>
  call<void>("PUT", `/collections/${list}/marks/${item}`)

export const removeMark = (list: number, item: string) =>
  call<void>("DELETE", `/collections/${list}/marks/${item}`)

/** A page at a time, for a reader tidying a list rather than saving one thing.
 *  Both answer how many marks actually changed, which is not always how many
 *  were named: a page can be a moment out of date. */
export const removeMarks = (list: number, items: string[]) =>
  call<{ changed: number }>("POST", `/collections/${list}/marks/remove`, { items })

export const moveMarks = (from: number, to: number, items: string[]) =>
  call<{ changed: number }>("POST", `/collections/${from}/marks/move`, { items, to })

/** What the service will refuse, said before it has to. */
export const RULES = {
  username: "2 to 32 characters: letters, digits, - and _",
  password: "at least 8 characters",
  listName: 64,
} as const

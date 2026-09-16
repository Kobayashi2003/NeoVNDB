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

/** What the service will refuse, said before it has to. */
export const RULES = {
  username: "2 to 32 characters: letters, digits, - and _",
  password: "at least 8 characters",
} as const

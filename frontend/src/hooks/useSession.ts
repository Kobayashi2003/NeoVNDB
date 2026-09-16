/** Who is reading, and the four things they can do about it.
 *
 *  One module-level store rather than a context, for the same reason the
 *  reading preferences are one: it is a single answer that every component
 *  asking gets the same copy of, and there is no part of the tree it should be
 *  scoped to. `useSyncExternalStore` is how React reads such a thing without
 *  the first client render disagreeing with the markup the server sent.
 *
 *  The server is given `unknown` on purpose. It has no cookie to read -- see
 *  lib/user.ts for why that is a decision and not a limitation -- so the
 *  markup says "not known yet", and the answer arrives a moment after
 *  hydration. Anything drawn from this has to have something to show for that
 *  moment. */
"use client"

import { useSyncExternalStore } from "react"
import { changePassword, login, logout, logoutEverywhere, me, register, type User } from "@/lib/user"

export interface Session {
  /** `unknown` until the first answer comes back, and never again after. */
  status: "unknown" | "out" | "in"
  user: User | null
}

export interface SessionControl extends Session {
  signIn(username: string, password: string): Promise<void>
  signUp(username: string, password: string, email: string): Promise<void>
  signOut(): Promise<void>
  /** Ends every session this account has, this browser included. */
  signOutEverywhere(): Promise<void>
  /** Changing the password ends every session and starts a fresh one here, so
   *  the reader stays signed in on the browser that asked and nowhere else. */
  setPassword(current: string, next: string): Promise<void>
  /** Drop the reader without asking the service. For a reply that has just
   *  said the session is gone -- signed out in another tab, or expired. */
  forget(): void
}

const UNKNOWN: Session = { status: "unknown", user: null }
const OUT: Session = { status: "out", user: null }

// Referentially stable between changes, or every render would look like one.
let current: Session = UNKNOWN
let asked = false

const listeners = new Set<() => void>()

function announce(): void {
  for (const notify of listeners) notify()
}

function hold(user: User | null): void {
  current = user ? { status: "in", user } : OUT
  announce()
}

/** Asked once for the life of the page. A signed-out reader is an answer like
 *  any other, so there is nothing to retry.
 *
 *  Its answer is taken only while nothing better has arrived. Signing in
 *  during the wait is the newer truth, and this question was sent before that
 *  cookie existed -- letting a late "not signed in" land on top of it would
 *  tell a reader who is signed in that they are not, and leave every control
 *  that asks drawn the wrong way round. */
function ask(): void {
  if (asked) return
  asked = true
  const settle = (user: User | null) => {
    if (current.status === "unknown") hold(user)
  }
  me().then(settle, () => settle(null))
}

function subscribe(notify: () => void): () => void {
  ask()
  listeners.add(notify)
  return () => {
    listeners.delete(notify)
  }
}

function snapshot(): Session {
  return current
}

function serverSnapshot(): Session {
  return UNKNOWN
}

const control = {
  async signIn(username: string, password: string): Promise<void> {
    hold(await login(username, password))
  },
  async signUp(username: string, password: string, email: string): Promise<void> {
    hold(await register(username, password, email))
  },
  async signOut(): Promise<void> {
    await logout()
    hold(null)
  },
  async signOutEverywhere(): Promise<void> {
    await logoutEverywhere()
    hold(null)
  },
  async setPassword(currentPassword: string, next: string): Promise<void> {
    await changePassword(currentPassword, next)
  },
  forget(): void {
    hold(null)
  },
}

export function useSession(): SessionControl {
  const session = useSyncExternalStore(subscribe, snapshot, serverSnapshot)
  return { ...session, ...control }
}

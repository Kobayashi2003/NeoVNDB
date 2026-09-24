/** The session, in a module-level store like usePrefs. The server always
 *  renders `unknown` (see lib/user.ts), so consumers need a placeholder state. */
"use client"

import { useSyncExternalStore } from "react"
import {
  changePassword,
  deleteAccount,
  login,
  logout,
  logoutEverywhere,
  me,
  register,
  type User,
} from "@/lib/user"

export interface Session {
  /** `unknown` until the first answer comes back, and never again after. */
  status: "unknown" | "out" | "in"
  user: User | null
}

export interface SessionControl extends Session {
  signIn(username: string, password: string): Promise<void>
  signUp(username: string, password: string, email: string): Promise<void>
  signOut(): Promise<void>
  signOutEverywhere(): Promise<void>
  /** Ends other sessions; this browser stays signed in. */
  setPassword(current: string, next: string): Promise<void>
  /** Irreversible; signed out afterwards. */
  deleteAccount(password: string): Promise<void>
  /** Drop locally after the service reported the session gone. */
  forget(): void
}

const UNKNOWN: Session = { status: "unknown", user: null }
const OUT: Session = { status: "out", user: null }

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

/** Asked once per page load. A late answer is ignored if the reader signed in
 *  meanwhile, since it predates that cookie. */
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
  async deleteAccount(password: string): Promise<void> {
    await deleteAccount(password)
    hold(null)
  },
  forget(): void {
    hold(null)
  },
}

export function useSession(): SessionControl {
  const session = useSyncExternalStore(subscribe, snapshot, serverSnapshot)
  return { ...session, ...control }
}

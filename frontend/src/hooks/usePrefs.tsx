/** Reading preferences: the ones that mean the same thing in every section,
 *  and that a reader should not have to set twice.
 *
 *  Spoilers are deliberately not among them. A spoiler control belongs where
 *  the spoilers are, so it can say what the next click reveals and disappear
 *  where there is nothing to reveal.
 *
 *  They live in one module-level store rather than in a context, because that
 *  is what they are: one saved answer, shared by every component that asks and
 *  by every tab the reader has open. What the context here carries is only the
 *  value the server already rendered with, read from the cookie on the way in
 *  -- so the first client render agrees with the markup it is hydrating, and
 *  nothing rewrites itself a second later. See lib/prefs.ts. */
"use client"

import { createContext, useContext, useSyncExternalStore } from "react"
import {
  DEFAULTS,
  PREFS_COOKIE,
  PREFS_STORAGE,
  readPrefs,
  type Prefs,
} from "@/lib/prefs"

export type { CharacterLayout, Prefs } from "@/lib/prefs"

export interface PrefsControl extends Prefs {
  set: (change: Partial<Prefs>) => void
  /** Sexual content shown outright, which also ungates the tags and traits
   *  that only describe it. */
  explicit: boolean
}

const listeners = new Set<() => void>()

/** The snapshot must be referentially stable between changes, or every render
 *  would look like a change to React. */
let current: Prefs | null = null

function cookie(): string | null {
  const found = document.cookie
    .split("; ")
    .find((pair) => pair.startsWith(PREFS_COOKIE + "="))
  return found ? decodeURIComponent(found.slice(PREFS_COOKIE.length + 1)) : null
}

/** A year, because this is a preference and not a session; Lax, because it is
 *  read on ordinary navigation and has no business on a cross-site request. */
function writeCookie(prefs: Prefs): void {
  const value = encodeURIComponent(JSON.stringify(prefs))
  document.cookie = `${PREFS_COOKIE}=${value}; path=/; max-age=31536000; samesite=lax`
}

function load(): Prefs {
  const raw = cookie()
  if (raw !== null) return readPrefs(raw)

  // No cookie yet: either a first visit, or a reader who set these when they
  // lived in localStorage. Taking the old value over and writing it as a
  // cookie is what keeps the second reader's answers.
  try {
    const old = window.localStorage.getItem(PREFS_STORAGE)
    if (old) {
      const prefs = readPrefs(old)
      writeCookie(prefs)
      return prefs
    }
  } catch {
    // Storage can be unreadable; there is simply nothing to carry over.
  }
  return DEFAULTS
}

function snapshot(): Prefs {
  if (current === null) current = load()
  return current
}

// Another tab writing these should not leave this one disagreeing about what
// the reader has asked to see. The cookie is what both tabs read, but only
// localStorage announces itself, so it is still written -- as the signal.
function onStorage(e: StorageEvent): void {
  if (e.key !== PREFS_STORAGE) return
  current = load()
  for (const notify of listeners) notify()
}

function subscribe(notify: () => void): () => void {
  if (listeners.size === 0) window.addEventListener("storage", onStorage)
  listeners.add(notify)
  return () => {
    listeners.delete(notify)
    if (listeners.size === 0) window.removeEventListener("storage", onStorage)
  }
}

function update(change: Partial<Prefs>): void {
  current = { ...snapshot(), ...change }
  writeCookie(current)
  try {
    window.localStorage.setItem(PREFS_STORAGE, JSON.stringify(current))
  } catch {
    // The cookie is the one that matters; this is only the cross-tab signal.
  }
  for (const notify of listeners) notify()
}

/** What the server rendered with. Supplied by the root layout, which is the
 *  only place that reads the cookie. */
const Rendered = createContext<Prefs>(DEFAULTS)

export function PrefsRendered({
  value,
  children,
}: {
  value: Prefs
  children: React.ReactNode
}) {
  return <Rendered value={value}>{children}</Rendered>
}

export function usePrefs(): PrefsControl {
  const rendered = useContext(Rendered)
  // The third argument is used on the server and again while hydrating, which
  // is exactly when the store cannot be read and the cookie already decided.
  const prefs = useSyncExternalStore(subscribe, snapshot, () => rendered)
  return { ...prefs, set: update, explicit: prefs.sexual === "explicit" }
}

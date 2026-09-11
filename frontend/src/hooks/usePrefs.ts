/** Reading preferences: the ones that mean the same thing in every section,
 *  and that a reader should not have to set twice.
 *
 *  Spoilers are deliberately not among them. A spoiler control belongs where
 *  the spoilers are, so it can say what the next click reveals and disappear
 *  where there is nothing to reveal.
 *
 *  They live in one module-level store rather than in a context, because that
 *  is what they are: one saved answer, shared by every component that asks and
 *  by every tab the reader has open. `useSyncExternalStore` is how React reads
 *  such a thing without the first client render disagreeing with the markup
 *  the server sent -- the server has no storage, so it is given the defaults,
 *  and the saved values arrive on hydration. */
"use client"

import { useSyncExternalStore } from "react"
import type { SexualLevel, ViolenceLevel } from "@/lib/content"

/** How the character section lays its cards out. */
export type CharacterLayout = "grid" | "slider"

export interface Prefs {
  /** Show the original script where a romanisation exists. */
  original: boolean
  sexual: SexualLevel
  violence: ViolenceLevel
  layout: CharacterLayout
}

export interface PrefsControl extends Prefs {
  set: (change: Partial<Prefs>) => void
  /** Sexual content shown outright, which also ungates the tags and traits
   *  that only describe it. */
  explicit: boolean
}

const DEFAULTS: Prefs = {
  original: false,
  sexual: "safe",
  violence: "tame",
  layout: "grid",
}

const STORAGE_KEY = "neovndb:prefs"

const listeners = new Set<() => void>()

/** The snapshot must be referentially stable between changes, or every render
 *  would look like a change to React. */
let current: Prefs | null = null

function pick<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback
}

/** Storage can be unreadable (a private window, a browser set to block it) and
 *  can hold whatever an older version wrote, so each field is taken only when
 *  it is one of the values this version knows. */
function load(): Prefs {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULTS
    const saved = JSON.parse(raw) as Partial<Prefs>
    return {
      original: typeof saved.original === "boolean" ? saved.original : DEFAULTS.original,
      sexual: pick(saved.sexual, ["safe", "suggestive", "explicit"], DEFAULTS.sexual),
      violence: pick(saved.violence, ["tame", "violent", "brutal"], DEFAULTS.violence),
      layout: pick(saved.layout, ["grid", "slider"], DEFAULTS.layout),
    }
  } catch {
    return DEFAULTS
  }
}

function snapshot(): Prefs {
  if (current === null) current = load()
  return current
}

function serverSnapshot(): Prefs {
  return DEFAULTS
}

// Another tab writing the same key should not leave this one disagreeing about
// what the reader has asked to see. One listener serves every subscriber: the
// event is about the store, not about who is watching it.
function onStorage(e: StorageEvent): void {
  if (e.key !== STORAGE_KEY) return
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
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(current))
  } catch {
    // A reader who blocks storage still gets the preference for this visit.
  }
  for (const notify of listeners) notify()
}

export function usePrefs(): PrefsControl {
  const prefs = useSyncExternalStore(subscribe, snapshot, serverSnapshot)
  return { ...prefs, set: update, explicit: prefs.sexual === "explicit" }
}

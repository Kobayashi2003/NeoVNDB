/** The reader's lists, held once for every page that shows them, so moving
 *  between lists redraws the list and not the column beside it. Read again
 *  whenever a page that shows them mounts, and after anything that changes a
 *  name or a count; the last answer stays on screen meanwhile. */
"use client"

import { useEffect, useSyncExternalStore } from "react"
import { collections, errorText, type Collection } from "@/lib/user"

export interface Lists {
  lists: Collection[] | null
  error: string | null
}

const NONE: Lists = { lists: null, error: null }
let current: Lists = NONE
let asking: Promise<void> | null = null
const listeners = new Set<() => void>()

function set(next: Lists) {
  current = next
  for (const notify of listeners) notify()
}

/** Ask again; a call while one is out waits for that one. */
export function refreshCollections(): Promise<void> {
  asking ??= collections()
    .then(
      (lists) => set({ lists, error: null }),
      (err) => set({ lists: current.lists, error: errorText(err) }),
    )
    .finally(() => {
      asking = null
    })
  return asking
}

/** Forget them, as when the reader signs out. */
export function forgetCollections() {
  set(NONE)
}

export function useCollections(enabled: boolean): Lists {
  const held = useSyncExternalStore(
    (notify) => {
      listeners.add(notify)
      return () => void listeners.delete(notify)
    },
    () => current,
    () => NONE,
  )
  useEffect(() => {
    if (enabled) void refreshCollections()
  }, [enabled])
  return held
}

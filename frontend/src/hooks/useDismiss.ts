/** A popover that closes when the reader looks away: a pointer down outside
 *  it, or Escape.
 *
 *  Every menu in the app wants exactly this, and wrote it out for itself until
 *  there were four copies of the same twelve lines. The ref goes on whatever
 *  counts as "inside" -- usually the wrapper holding both the button and the
 *  menu, so clicking the button to close does not also register as an outside
 *  click and close it twice. */
"use client"

import { useEffect, useRef } from "react"

export function useDismiss<T extends HTMLElement>(open: boolean, close: () => void) {
  const inside = useRef<T>(null)
  // Kept in a ref so the listeners are bound once per opening rather than once
  // per render: callers pass a fresh closure every time.
  const latest = useRef(close)

  useEffect(() => {
    latest.current = close
  })

  useEffect(() => {
    if (!open) return
    const away = (e: MouseEvent) => {
      if (!inside.current?.contains(e.target as Node)) latest.current()
    }
    const escape = (e: KeyboardEvent) => {
      if (e.key === "Escape") latest.current()
    }
    document.addEventListener("mousedown", away)
    document.addEventListener("keydown", escape)
    return () => {
      document.removeEventListener("mousedown", away)
      document.removeEventListener("keydown", escape)
    }
  }, [open])

  return inside
}

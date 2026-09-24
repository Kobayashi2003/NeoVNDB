/** Arrow keys, Home and End move focus through a menu's items. Keys are read
 *  on `box` (the toggle and the panel), so the first ArrowDown from the
 *  toggle lands on the first item; `panel` holds the items. */
"use client"

import { useEffect, type RefObject } from "react"

const ITEMS = "a[href], button:not([disabled]), input:not([disabled]):not([type=hidden])"

export function useArrowKeys(
  open: boolean,
  box: RefObject<HTMLElement | null>,
  panel: RefObject<HTMLElement | null>,
) {
  useEffect(() => {
    const el = box.current
    if (!open || !el) return

    const move = (e: KeyboardEvent) => {
      if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) return
      const target = e.target as HTMLElement
      // A number box steps with the arrows, and a text box moves its caret on
      // Home and End.
      if (target instanceof HTMLInputElement) {
        if (target.type === "number") return
        if (e.key === "Home" || e.key === "End") return
      }
      const items = [...(panel.current?.querySelectorAll<HTMLElement>(ITEMS) ?? [])].filter(
        (item) => item.offsetParent !== null,
      )
      if (items.length === 0) return

      e.preventDefault()
      const at = items.indexOf(document.activeElement as HTMLElement)
      const next =
        e.key === "Home"
          ? 0
          : e.key === "End"
            ? items.length - 1
            : at === -1
              ? e.key === "ArrowDown"
                ? 0
                : items.length - 1
              : (at + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length
      items[next].focus()
    }

    el.addEventListener("keydown", move)
    return () => el.removeEventListener("keydown", move)
  }, [open, box, panel])
}

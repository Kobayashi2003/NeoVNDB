/** Keeps an open menu on screen.
 *
 *  Which side has room is a fact about this control at this width, and no CSS
 *  expression knows it. A menu hung from the left of a control near the right
 *  edge runs off one way; one hung from the right of a control that is not at
 *  the right edge runs off the other. Both happen here -- the last of seven
 *  filter buttons on a phone, and the save button sitting mid-row beside the
 *  spoiler control on a character page.
 *
 *  So it is measured when it opens and moved back, and written straight to the
 *  node: the browser is the external thing being kept in step here, not any
 *  state of ours. The shift is never more than the room on the other side, so
 *  pushing one edge on screen cannot take the other off. */
"use client"

import { useEffect, useRef } from "react"

export function useKeptOnScreen<T extends HTMLElement>(open: boolean) {
  const ref = useRef<T>(null)

  useEffect(() => {
    const el = ref.current
    if (!open || !el) return

    el.style.transform = ""
    const box = el.getBoundingClientRect()
    const margin = 8

    const pastRight = box.right - (window.innerWidth - margin)
    const pastLeft = margin - box.left

    let shift = 0
    if (pastRight > 0) shift = -Math.min(pastRight, Math.max(box.left - margin, 0))
    else if (pastLeft > 0) shift = Math.min(pastLeft, Math.max(window.innerWidth - margin - box.right, 0))

    el.style.transform = shift === 0 ? "" : `translateX(${shift}px)`
  }, [open])

  return ref
}

/** Clamps long prose and offers to unfold it -- but only once it measures tall
 *  enough to be worth clamping, so a two-line description never grows a
 *  pointless button. */
"use client"

import { useEffect, useRef, useState } from "react"
import { ChevronDown } from "lucide-react"

export function Collapsible({
  maxHeight = 220,
  children,
}: {
  maxHeight?: number
  children: React.ReactNode
}) {
  const body = useRef<HTMLDivElement>(null)
  const [overflows, setOverflows] = useState(false)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const el = body.current
    if (!el) return
    const measure = () => setOverflows(el.scrollHeight > maxHeight + 8)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [maxHeight])

  return (
    <div className="relative">
      <div
        ref={body}
        style={{ maxHeight: open || !overflows ? undefined : maxHeight }}
        className="overflow-hidden"
      >
        {children}
      </div>

      {overflows && !open && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-[var(--surface)] to-transparent" />
      )}
      {overflows && (
        <button
          onClick={() => setOpen(!open)}
          className="relative mt-1 flex items-center gap-1 text-xs text-muted transition-colors hover:text-accent"
        >
          <ChevronDown className={`icon-text h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden />
          {open ? "Show less" : "Show more"}
        </button>
      )}
    </div>
  )
}

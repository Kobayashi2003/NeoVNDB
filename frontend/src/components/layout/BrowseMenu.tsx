/** The seven shelves, for screens too narrow to lay them out in a row.
 *
 *  They used to be a strip that scrolled sideways. It fit, in the sense that
 *  nothing overflowed, but the last shelves sat off the end of a bar nobody
 *  would think to drag -- on a desktop there is not even a gesture for it
 *  without a shift key. A shelf you cannot see and cannot reach is not there.
 *
 *  So below the width where all seven fit, they become one button. It names
 *  the shelf the reader is standing in rather than saying "Browse", because
 *  the bar's other job is to say where you are, and the row above did that by
 *  marking one of the seven. */
"use client"

import { useState } from "react"
import Link from "next/link"
import { Check, ChevronDown, Library } from "lucide-react"
import { cn } from "@/lib/utils"
import { LIST } from "@/lib/list"
import { SHORT, TYPES } from "./shelves"
import { useDismiss } from "@/hooks/useDismiss"
import { useKeptOnScreen } from "@/hooks/useKeptOnScreen"

export function BrowseMenu({ here, className }: { here?: string; className?: string }) {
  const [open, setOpen] = useState(false)
  const box = useDismiss<HTMLDivElement>(open, () => setOpen(false))
  // Hung from the left of a button that starts after the logo, so on the
  // narrowest screens its right edge lands past the window.
  const menu = useKeptOnScreen<HTMLDivElement>(open)

  return (
    <div ref={box} className={cn("relative min-w-0 flex-1", className)}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label="Browse"
        className={cn(
          "flex max-w-full items-center gap-1 rounded-full px-3 py-1 text-xs font-medium transition-colors",
          here ? "bg-white/15 text-white" : "text-muted hover:bg-white/10 hover:text-white",
        )}
      >
        <Library className="h-3.5 w-3.5 shrink-0" aria-hidden />
        <span className="truncate">{here ? SHORT[here] : "Browse"}</span>
        <ChevronDown
          className={cn("h-3 w-3 shrink-0 transition-transform", open && "rotate-180")}
          aria-hidden
        />
      </button>

      {open && (
        <div
          ref={menu}
          className="absolute left-0 top-full z-30 mt-1 w-52 max-w-[calc(100vw-2rem)] rounded-lg border border-white/10 bg-[var(--overlay)] p-1 shadow-xl"
        >
          {TYPES.map((type) => {
            const on = type === here
            return (
              <Link
                key={type}
                href={`/${type}`}
                onClick={() => setOpen(false)}
                aria-current={on ? "page" : undefined}
                className={cn(
                  "flex items-center gap-2 rounded px-2 py-1.5 text-xs transition-colors",
                  on ? "text-accent" : "text-white/80 hover:bg-white/10",
                )}
              >
                <Check className={cn("h-3 w-3 shrink-0", !on && "invisible")} aria-hidden />
                <span className="truncate">{LIST[type].label}</span>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}

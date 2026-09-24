/** The front page's month: arrows step one month, the label opens a year of
 *  months. Every step is a link; the only state is which year the picker shows. */
"use client"

import { useState } from "react"
import Link from "next/link"
import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"
import { MenuPanel } from "@/components/ui/Menu"
import { withParams, type Params } from "@/lib/href"
import { useMenu } from "@/hooks/useMenu"
import { monthName, monthNames, stepMonth } from "@/lib/months"

function href(path: string, params: Params, year: number, month: number): string {
  // A different month is a different set of results, so whatever page the
  // reader was on no longer means anything.
  return withParams(path, params, {
    year: String(year),
    month: String(month).padStart(2, "0"),
    page: null,
  })
}

export function MonthPicker({
  path,
  params,
  year,
  month,
}: {
  path: string
  params: Params
  year: number
  month: number
}) {
  const [open, setOpen] = useState(false)
  const [showing, setShowing] = useState(year)
    const { box, panel: menu } = useMenu(open, setOpen)

  const back = stepMonth(year, month, -1)
  const on = stepMonth(year, month, 1)

  return (
    <div ref={box} className="relative flex items-center gap-1">
      <Link
        href={href(path, params, back.year, back.month)}
        aria-label={`${monthName(back.month)} ${back.year}`}
        className="rounded-full p-1.5 text-muted transition-colors hover:bg-white/10 hover:text-white"
      >
        <ChevronLeft className="h-4 w-4" aria-hidden />
      </Link>

      <button
        type="button"
        onClick={() => {
          setShowing(year)
          setOpen((o) => !o)
        }}
        aria-expanded={open}
        className="flex items-center gap-1 rounded-full px-2 py-1 text-sm font-semibold transition-colors hover:bg-white/10"
      >
        <span className="tabular-nums">
          {monthName(month)} {year}
        </span>
        <ChevronDown
          className={cn("icon-text h-3 w-3 shrink-0 text-muted transition-transform", open && "rotate-180")}
          aria-hidden
        />
      </button>

      <Link
        href={href(path, params, on.year, on.month)}
        aria-label={`${monthName(on.month)} ${on.year}`}
        className="rounded-full p-1.5 text-muted transition-colors hover:bg-white/10 hover:text-white"
      >
        <ChevronRight className="h-4 w-4" aria-hidden />
      </Link>

      {open && (
        <MenuPanel ref={menu} className="w-64 p-2">
          <div className="mb-2 flex items-center justify-between">
            <button
              type="button"
              onClick={() => setShowing((y) => y - 1)}
              aria-label={`${showing - 1}`}
              className="rounded-full p-1 text-muted transition-colors hover:bg-white/10 hover:text-white"
            >
              <ChevronLeft className="h-4 w-4" aria-hidden />
            </button>
            <span className="text-sm font-semibold tabular-nums">{showing}</span>
            <button
              type="button"
              onClick={() => setShowing((y) => y + 1)}
              aria-label={`${showing + 1}`}
              className="rounded-full p-1 text-muted transition-colors hover:bg-white/10 hover:text-white"
            >
              <ChevronRight className="h-4 w-4" aria-hidden />
            </button>
          </div>

          <div className="grid grid-cols-3 gap-1">
            {monthNames().map((name, i) => {
              const here = showing === year && i + 1 === month
              return (
                <Link
                  key={name}
                  href={href(path, params, showing, i + 1)}
                  onClick={() => setOpen(false)}
                  aria-current={here ? "page" : undefined}
                  className={cn(
                    "rounded px-2 py-1.5 text-center text-xs transition-colors",
                    here ? "bg-accent text-background" : "text-white/80 hover:bg-white/10",
                  )}
                >
                  {name.slice(0, 3)}
                </Link>
              )
            })}
          </div>
        </MenuPanel>
      )}
    </div>
  )
}

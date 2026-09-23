/** Getting from one list to another without going back to the index first.
 *
 *  Two shapes of the same thing. Where there is room beside the page it is a
 *  column, always open, so moving between lists is one click and the reader
 *  can see what else they keep. Where there is not it is the list's own name
 *  turned into a button, which is the smallest control that can still say
 *  where you are and offer everywhere else.
 *
 *  Grouped by kind in both, because a list's type decides what can go on it,
 *  and two lists called Favourites are told apart only by the shelf they sit
 *  on. */
"use client"

import { useState } from "react"
import Link from "next/link"
import { ChevronDown, Library } from "lucide-react"
import { cn } from "@/lib/utils"
import { MenuDivider, MenuLabel, MenuPanel, menuItem } from "@/components/ui/Menu"
import { LIST } from "@/lib/list"
import { TYPES } from "@/components/layout/shelves"
import type { Collection } from "@/lib/user"
import { useDismiss } from "@/hooks/useDismiss"
import { useKeptOnScreen } from "@/hooks/useKeptOnScreen"

function byType(lists: Collection[]) {
  return TYPES.map((type) => ({ type, mine: lists.filter((l) => l.type === type) })).filter(
    (shelf) => shelf.mine.length > 0,
  )
}

function Row({ list, here, onGo }: { list: Collection; here: boolean; onGo?: () => void }) {
  return (
    <Link
      href={`/u/${list.id}`}
      onClick={onGo}
      aria-current={here ? "page" : undefined}
      className={menuItem({ current: here })}
    >
      <span className="min-w-0 flex-1 truncate">{list.name}</span>
      <span className="shrink-0 tabular-nums text-muted">{list.count}</span>
    </Link>
  )
}

/** The column, for screens with room for one. */
export function CollectionColumn({
  lists,
  current,
  className,
}: {
  lists: Collection[]
  current: number
  className?: string
}) {
  return (
    <nav aria-label="Your lists" className={cn("flex flex-col gap-4", className)}>
      {byType(lists).map(({ type, mine }) => (
        <div key={type} className="flex flex-col gap-0.5">
          <p className="px-2.5 text-[0.625rem] font-semibold uppercase tracking-wider text-muted/70">
            {LIST[type].label}
          </p>
          {mine.map((list) => (
            <Row key={list.id} list={list} here={list.id === current} />
          ))}
        </div>
      ))}
      <Link
        href="/u"
        className="px-2.5 text-xs text-muted transition-colors hover:text-white"
      >
        Manage lists
      </Link>
    </nav>
  )
}

/** The button, for screens without. */
export function CollectionPicker({
  lists,
  current,
  className,
}: {
  lists: Collection[]
  current: number
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const box = useDismiss<HTMLDivElement>(open, () => setOpen(false))
  const menu = useKeptOnScreen<HTMLDivElement>(open)
  const here = lists.find((l) => l.id === current)

  return (
    <div ref={box} className={cn("relative min-w-0", className)}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex max-w-full items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-xs font-medium transition-colors hover:bg-white/20"
      >
        <Library className="icon-text h-3.5 w-3.5 shrink-0" aria-hidden />
        <span className="truncate">{here?.name ?? "Your lists"}</span>
        <ChevronDown
          className={cn("icon-text h-3 w-3 shrink-0 transition-transform", open && "rotate-180")}
          aria-hidden
        />
      </button>

      {open && (
        <MenuPanel ref={menu} scroll>
          {byType(lists).map(({ type, mine }) => (
            <div key={type}>
              <MenuLabel>{LIST[type].label}</MenuLabel>
              {mine.map((list) => (
                <Row
                  key={list.id}
                  list={list}
                  here={list.id === current}
                  onGo={() => setOpen(false)}
                />
              ))}
            </div>
          ))}
          <MenuDivider />
          <Link href="/u" onClick={() => setOpen(false)} className={menuItem({ className: "text-muted" })}>
            Manage lists
          </Link>
        </MenuPanel>
      )}
    </div>
  )
}

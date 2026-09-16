/** The bar every page hangs under.
 *
 *  Seven shelves, because the database has seven kinds of thing in it and
 *  until now the only way between them was to type the address. The one the
 *  reader is looking at is marked, which on a detail page means the kind that
 *  page is about: arriving at a character from a visual novel should still say
 *  which shelf you are standing in front of.
 *
 *  Two forms of the same row. All seven fit side by side from 800px -- they
 *  need 473px, and the worst case, a name at its full cap, still leaves them
 *  514px. Below that they collapse into one menu rather than a strip that
 *  scrolls sideways: a strip fit, in the sense that nothing overflowed, but
 *  the last shelves sat off the end of a bar nobody would think to drag.
 *
 *  Either way it is one row at every width, which is what lets a page subtract
 *  `--header-h` from the viewport and trust the answer. */
"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { LIST } from "@/lib/list"
import { SHORT, TYPES } from "./shelves"
import { BrowseMenu } from "./BrowseMenu"
import { UserMenu } from "@/components/user/UserMenu"

export function Header() {
  const pathname = usePathname()
  // Both /v and /v17 belong to the same shelf, so one rule finds either.
  const here = /^\/([vrcpsgi])\d*$/.exec(pathname)?.[1]

  return (
    <header className="sticky top-0 z-40 h-(--header-h) shrink-0 border-b border-white/10 bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-full max-w-7xl items-center gap-3 px-4">
        <Link
          href="/"
          className="shrink-0 font-display text-lg tracking-tight transition-opacity hover:opacity-80"
        >
          NeoVNDB
        </Link>

        <BrowseMenu here={here} className="min-[800px]:hidden" />

        <nav
          aria-label="Browse"
          className="hidden min-w-0 flex-1 items-center gap-1 min-[800px]:flex"
        >
          {TYPES.map((type) => (
            <Link
              key={type}
              href={`/${type}`}
              aria-current={type === here ? "page" : undefined}
              title={LIST[type].label}
              className={cn(
                "shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors",
                type === here
                  ? "bg-white/15 text-white"
                  : "text-muted hover:bg-white/10 hover:text-white",
              )}
            >
              {SHORT[type]}
            </Link>
          ))}
        </nav>

        <UserMenu />
      </div>
    </header>
  )
}

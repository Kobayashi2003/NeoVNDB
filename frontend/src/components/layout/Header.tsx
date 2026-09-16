/** The bar every page hangs under.
 *
 *  Seven links, because the database has seven kinds of thing in it and until
 *  now the only way between them was to type the address. The one the reader
 *  is looking at is marked, which on a detail page means the kind that page is
 *  about: arriving at a character from a visual novel should still say which
 *  shelf you are standing in front of.
 *
 *  One row at every width. The strip scrolls sideways on a phone rather than
 *  wrapping, so the bar's height is a constant the page layout can subtract --
 *  which is what `--header-h` is for. The reader's own end of the bar sits
 *  outside that scroller, so it stays reachable however narrow the screen. */
"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { LIST } from "@/lib/list"
import { UserMenu } from "@/components/user/UserMenu"

const TYPES = ["v", "c", "r", "p", "s", "g", "i"] as const

/** Short enough to fit seven of them on a phone. */
const SHORT: Record<string, string> = {
  v: "Novels",
  c: "Characters",
  r: "Releases",
  p: "Producers",
  s: "Staff",
  g: "Tags",
  i: "Traits",
}

export function Header() {
  const pathname = usePathname()
  // Both /v and /v17 belong to the same shelf, so one rule finds either.
  const here = /^\/([vrcpsgi])\d*$/.exec(pathname)?.[1]

  return (
    <header className="sticky top-0 z-40 h-(--header-h) shrink-0 border-b border-white/10 bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-full max-w-7xl items-center gap-3 px-4">
        <Link
          href="/"
          className="shrink-0 text-lg font-black italic tracking-tight transition-opacity hover:opacity-80"
        >
          NeoVNDB
        </Link>

        {/* Its own scroller, so a narrow screen scrolls the links rather than
            wrapping them onto a second row and changing the bar's height. */}
        <nav
          aria-label="Browse"
          className="-mx-1 flex min-w-0 flex-1 items-center gap-1 overflow-x-auto px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
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

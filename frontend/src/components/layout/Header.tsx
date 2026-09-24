/** The site header: seven type shelves, the current one marked (detail pages
 *  included). Below 840px the shelves collapse into a menu.
 *
 *  840 is measured: the worst case (a max-length username, view button and
 *  search control) leaves 11px spare. Re-measure before adding anything. It
 *  stays one row at every width, which `--header-h` relies on. */
"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Search } from "lucide-react"
import { cn } from "@/lib/utils"
import { LIST } from "@/lib/list"
import { SHORT, TYPES } from "./shelves"
import { BrowseMenu } from "./BrowseMenu"
import { SearchField } from "./SearchField"
import { ViewMenu } from "./ViewMenu"
import { UserMenu } from "@/components/user/UserMenu"

export function Header() {
  const pathname = usePathname()
  const here = /^\/([vrcpsgi])\d*$/.exec(pathname)?.[1]

  return (
    <header className="sticky top-0 z-40 h-(--header-h) shrink-0 border-b border-white/10 bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-full max-w-page items-center gap-3 px-4">
        <Link
          href="/"
          className="shrink-0 font-display text-lg tracking-tight transition-opacity hover:opacity-80"
        >
          NeoVNDB
        </Link>

        <BrowseMenu here={here} className="min-[840px]:hidden" />

        <nav
          aria-label="Browse"
          className="hidden min-w-0 flex-1 items-center gap-1 min-[840px]:flex"
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

        {/* The box where there is room for one, an icon where there is room
            only for that, and on the narrowest screens neither: below sm the
            browse menu carries it, because 40px is the difference between the
            bar fitting and not at 320 with a name at its full cap. */}
        <SearchField className="hidden lg:flex lg:w-52 xl:w-64" />
        <Link
          href="/q"
          aria-label="Search everything"
          title="Search everything"
          className="hidden size-7 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:bg-white/10 hover:text-white sm:flex lg:hidden"
        >
          <Search className="size-4" aria-hidden />
        </Link>

        <ViewMenu />
        <UserMenu />
      </div>
    </header>
  )
}

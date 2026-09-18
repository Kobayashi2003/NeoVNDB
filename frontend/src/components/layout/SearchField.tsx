/** The box that searches everything.
 *
 *  It navigates on submit rather than on every keystroke, like the listings'
 *  own search does and for the same reason: each query is a round trip, and a
 *  reader typing a title does not want seven of them.
 *
 *  An id typed in full is not a search but a destination, and the results page
 *  sends it on. Nothing has to be decided here for that to work -- which is
 *  why it is decided there, where a link from anywhere else lands too. */
"use client"

import { useRouter } from "next/navigation"
import { Search } from "lucide-react"
import { cn } from "@/lib/utils"

export function SearchField({
  initial = "",
  className,
  autoFocus,
}: {
  initial?: string
  className?: string
  autoFocus?: boolean
}) {
  const router = useRouter()

  return (
    <form
      role="search"
      onSubmit={(e) => {
        e.preventDefault()
        const term = String(new FormData(e.currentTarget).get("q") ?? "").trim()
        if (term) router.push(`/q?q=${encodeURIComponent(term)}`)
      }}
      className={cn(
        "flex min-w-0 items-center gap-2 rounded-full border border-white/10 bg-surface px-3 py-1.5 transition-colors focus-within:border-white/30",
        className,
      )}
    >
      <Search className="size-3.5 shrink-0 text-muted" aria-hidden />
      <input
        name="q"
        type="search"
        defaultValue={initial}
        autoFocus={autoFocus}
        placeholder="Search everything"
        aria-label="Search everything"
        className="min-w-0 flex-1 bg-transparent text-xs outline-none placeholder:text-muted"
      />
    </form>
  )
}

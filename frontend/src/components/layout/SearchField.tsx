/** Header search, navigating to /q on submit (not per keystroke). /q
 *  handles a typed id, so links from elsewhere get the same treatment. */
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
      <Search className="icon-text size-3.5 shrink-0 text-muted" aria-hidden />
      <input
        name="q"
        type="search"
        defaultValue={initial}
        autoFocus={autoFocus}
        placeholder="Search everything"
        aria-label="Search everything"
        className="-my-1.5 min-w-0 flex-1 bg-transparent py-1.5 text-xs outline-none placeholder:text-muted"
      />
    </form>
  )
}

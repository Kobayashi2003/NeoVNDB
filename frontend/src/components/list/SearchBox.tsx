/** A list page's search, applied on submit as the `search` filter. */
"use client"

import { useRouter } from "next/navigation"
import { Search } from "lucide-react"
import { withParams, type Params } from "@/lib/href"

export function SearchBox({
  path,
  params,
  initial,
}: {
  path: string
  params: Params
  initial: string
}) {
  const router = useRouter()

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        const term = new FormData(e.currentTarget).get("search")
        // A new search invalidates whatever page the reader was on.
        router.push(withParams(path, params, { search: String(term ?? ""), page: null }))
      }}
      className="flex w-full min-w-0 items-center gap-2 rounded-full border border-white/10 bg-surface px-3 py-1.5 sm:w-auto"
    >
      <Search className="icon-text h-3.5 w-3.5 shrink-0 text-muted" aria-hidden />
      <input
        name="search"
        type="search"
        defaultValue={initial}
        placeholder="Search"
        aria-label="Search"
        className="-my-1.5 min-w-0 flex-1 bg-transparent py-1.5 text-xs outline-none placeholder:text-muted"
      />
    </form>
  )
}

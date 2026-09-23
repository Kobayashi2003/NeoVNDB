/** The search field.
 *
 *  The one control on a list page that cannot be a link, because what it
 *  navigates to is not known until it is typed. It navigates on submit rather
 *  than on every keystroke: each query is a round trip to the database, and a
 *  reader typing a title does not want seven of them.
 *
 *  `search` is a filter like any other, so submitting is the same edit to the
 *  address the sort links make. */
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
      className="flex min-w-0 items-center gap-2 rounded-full border border-white/10 bg-surface px-3 py-1.5"
    >
      <Search className="icon-text h-3.5 w-3.5 shrink-0 text-muted" aria-hidden />
      <input
        name="search"
        type="search"
        defaultValue={initial}
        placeholder="Search"
        aria-label="Search"
        className="min-w-0 flex-1 bg-transparent text-xs outline-none placeholder:text-muted"
      />
    </form>
  )
}

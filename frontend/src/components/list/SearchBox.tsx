/** A list page's search, applied on submit as the `search` filter. */
"use client"

import { useNavigate } from "@/components/layout/Navigation"
import { withParams, type Params } from "@/lib/href"
import { SearchPill } from "@/components/ui/SearchPill"

export function SearchBox({
  path,
  params,
  initial,
}: {
  path: string
  params: Params
  initial: string
}) {
  const router = useNavigate()

  return (
    <SearchPill
      name="search"
      initial={initial}
      label="Search"
      // A new search invalidates whatever page the reader was on.
      onSearch={(term) => router.push(withParams(path, params, { search: term, page: null }))}
      className="w-full sm:w-auto"
    />
  )
}

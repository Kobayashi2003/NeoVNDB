/** Header search, navigating to /q on submit (not per keystroke). /q
 *  handles a typed id, so links from elsewhere get the same treatment. */
"use client"

import { useRouter } from "next/navigation"
import { SearchPill } from "@/components/ui/SearchPill"

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
    <SearchPill
      role="search"
      name="q"
      initial={initial}
      label="Search everything"
      placeholder="Search everything"
      autoFocus={autoFocus}
      onSearch={(raw) => {
        const term = raw.trim()
        if (term) router.push(`/q?q=${encodeURIComponent(term)}`)
      }}
      className={className}
    />
  )
}

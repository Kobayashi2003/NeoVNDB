/** A name in whichever script the reader asked for.
 *
 *  Which one that is is a client-side preference, and most of the catalogue
 *  pages are rendered on the server, so the choice cannot be made where the
 *  name is fetched. This is the smallest thing that can make it: a span that
 *  knows the pair and picks between them. */
"use client"

import { display } from "@/lib/format"
import { usePrefs } from "@/hooks/usePrefs"

export function Name({
  name,
  original,
  fallback,
}: {
  name: string | null
  original: string | null
  /** Shown when the entity has neither, which for a few rows it does not. */
  fallback?: string
}) {
  const { original: prefer } = usePrefs()
  return <>{display(name, original, prefer) || fallback || ""}</>
}

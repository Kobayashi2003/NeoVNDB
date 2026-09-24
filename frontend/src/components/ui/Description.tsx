/** A description in the reader's chosen language: the project's translation
 *  when there is one, else vndb's English. Both render through BBCode, which
 *  is why translations must keep the source's markup (the seed checks). */
"use client"

import { BBCode } from "@/lib/bbcode"
import { usePrefs } from "@/hooks/usePrefs"

export function Description({
  text,
  translation,
}: {
  text: string
  translation?: string | null
}) {
  const { original } = usePrefs()
  return <BBCode text={original && translation ? translation : text} />
}

/** A description in whichever language the reader asked for.
 *
 *  The companion to Name, for the long half. vndb writes tag and trait text in
 *  English only, so what the original-text toggle offers here is a translation
 *  this project supplies -- and where there is none, the English stands.
 *
 *  Both halves go through the same BBCode renderer, which is why a translation
 *  has to carry the source's markup and bare ids through unchanged: the links
 *  in it are the source's links. The seed refuses any that does not. */
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

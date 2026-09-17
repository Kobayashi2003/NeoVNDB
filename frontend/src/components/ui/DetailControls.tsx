/** The controls that act on the thing a detail page is about.
 *
 *  They sit together in the header, in one order everywhere: whatever the page
 *  adds of its own first, then what the reader thought of it, then the script
 *  toggle, then saving. The last three are on every one of the seven pages, so
 *  a reader who learns where they are once has learnt it for all of them.
 *
 *  There is a second reason they share a row. Whether there is a save button
 *  is not known until the session comes back, and on a narrow screen these
 *  controls are a row of their own -- so a row that appeared only then would
 *  push the whole page down a moment after it was drawn. The script toggle
 *  needs no session and is always here, which gives the row its height from
 *  the first paint and leaves the save button nothing to grow. */

import { OriginalToggle } from "./PrefsControls"
import { RatingStars } from "@/components/user/RatingStars"
import { CollectionButton } from "@/components/user/CollectionButton"

export function DetailControls({
  id,
  children,
}: {
  /** The vndb id of the thing on the page, which is what gets saved. */
  id: string
  /** Anything this page has that the others do not, such as the character
   *  pages' spoiler control. */
  children?: React.ReactNode
}) {
  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {children}
      <RatingStars id={id} />
      <OriginalToggle />
      <CollectionButton id={id} />
    </div>
  )
}

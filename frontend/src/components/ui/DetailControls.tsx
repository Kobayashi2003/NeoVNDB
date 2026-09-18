/** The controls that act on the thing a detail page is about.
 *
 *  They sit together in the header, in one order everywhere: whatever the page
 *  adds of its own first, then what the reader thought of it, then saving.
 *  The last two are on every one of the seven pages, so a reader who learns
 *  where they are once has learnt it for all of them.
 *
 *  Both of them wait for the session, and on a narrow screen these controls
 *  are a row of their own -- so a row that arrived with the session would push
 *  the whole page down a moment after it was drawn. The row therefore holds
 *  the height of the tallest thing that can land in it from the first paint.
 *  The script toggle used to do that job by being here and needing no session;
 *  it now lives in the header bar, with the rest of what the reader has chosen
 *  to see. */

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
    <div className="flex min-h-7 flex-wrap items-center justify-end gap-2">
      {children}
      <RatingStars id={id} />
      <CollectionButton id={id} />
    </div>
  )
}

/** The detail header's actions, in one order on every page: the page's own,
 *  then rating, then saving. Both wait for the session, so the row reserves
 *  their height from the first paint to avoid a shift on narrow screens. */

import { RatingStars } from './RatingStars';
import { CollectionButton } from './CollectionButton';

export function DetailControls({
  id,
  children,
}: {
  /** The vndb id of the thing on the page, which is what gets saved. */
  id: string;
  /** Anything this page has that the others do not, such as the character
   *  pages' spoiler control. */
  children?: React.ReactNode;
}) {
  return (
    <div className="flex min-h-7 flex-wrap items-center justify-end gap-2">
      {children}
      <RatingStars id={id} />
      <CollectionButton id={id} />
    </div>
  );
}

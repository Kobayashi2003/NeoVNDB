/** A release's age rating, coloured by how restrictive it is.
 *
 *  The number alone makes a reader stop and compare; the colour sorts a long
 *  release list at a glance. Magenta is not a step on that scale -- it marks
 *  an uncensored release, which is a different fact that vndb also shows here. */

import { cn } from '@/lib/utils';
import { Tooltip } from './Tooltip';

function tone(minage: number, uncensored: boolean): string {
  if (uncensored) return 'text-fuchsia-400';
  if (minage === 0) return 'text-green-400';
  if (minage >= 18) return 'text-red-400';
  if (minage >= 17) return 'text-orange-400';
  if (minage >= 15) return 'text-yellow-400';
  return 'text-white/70';
}

export function AgeRating({
  minage,
  uncensored = false,
}: {
  minage: number | null;
  uncensored?: boolean;
}) {
  if (minage === null) return <span className="text-muted">&mdash;</span>;

  const badge = (
    <span className={cn('font-medium tabular-nums', tone(minage, uncensored))}>
      {minage === 0 ? 'All ages' : `${minage}+`}
    </span>
  );
  return uncensored ? <Tooltip label="Uncensored">{badge}</Tooltip> : badge;
}

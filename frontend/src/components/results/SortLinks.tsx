/** Sort links. Clicking the active sort flips direction; a new sort starts
 *  from its useful end (ratings high first). Below sm they collapse into
 *  SortMenu unless the page shows that elsewhere (`menu={false}`). */

import { ArrowDown, ArrowUp } from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { ControlLabel } from '@/components/ui/ControlLabel';
import { withParams, type Params } from '@/lib/href';
import { reverseParam, type Sort } from '@/lib/list';
import { SortMenu } from './SortMenu';

export function SortLinks({
  path,
  params,
  sorts,
  active,
  reverse,
  menu = true,
}: {
  path: string;
  params: Params;
  sorts: Sort[];
  active: string;
  reverse: boolean;
  menu?: boolean;
}) {
  return (
    <>
      {menu && (
        <div className="flex items-center gap-1 sm:hidden">
          <ControlLabel>Sort</ControlLabel>
          <SortMenu
            path={path}
            params={params}
            sorts={sorts}
            active={active}
            reverse={reverse}
            labelled
          />
        </div>
      )}
      <div className="hidden flex-wrap items-center gap-1 sm:flex">
        <ControlLabel>Sort</ControlLabel>
        {sorts.map(sort => {
          const here = sort.value === active;
          // Changing the page's contents invalidates which page you were on.
          const next = here
            ? { sort: sort.value, reverse: reverseParam(sorts, sort.value, !reverse), page: null }
            : { sort: sort.value, reverse: null, page: null };

          return (
            <Link
              key={sort.value}
              href={withParams(path, params, next)}
              className={cn(
                'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition-colors',
                here ? 'bg-white/20 text-white' : 'text-muted hover:bg-white/10 hover:text-white',
              )}
            >
              {sort.label}
              {here &&
                (reverse ? (
                  <ArrowDown className="icon-text size-3 text-muted" aria-label="descending" />
                ) : (
                  <ArrowUp className="icon-text size-3 text-muted" aria-label="ascending" />
                ))}
            </Link>
          );
        })}
      </div>
    </>
  );
}

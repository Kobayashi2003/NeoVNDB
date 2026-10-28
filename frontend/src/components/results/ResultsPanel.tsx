/** One page of results with its sort and paging controls. Shared by the
 *  listings and the catalogue pages; `path` is where its links point. */

import { LIST, PAGE_SIZE } from '@/lib/list';
import { cn } from '@/lib/utils';
import { still } from '@/lib/viewTransitions';
import type { Params } from '@/lib/href';
import type { Results as ResultsData } from '@/lib/results';
import { Pagination } from './Pagination';
import { Results } from './Results';
import { SortLinks } from './SortLinks';
import { Collecting, SelectToggle } from './Collecting';

export function ResultsPanel({
  type,
  path,
  params,
  data,
  empty = 'Nothing matched.',
  controls,
  action,
  sortMenu = true,
}: {
  /** The type letter, which names both the spec and the result shape. */
  type: string;
  path: string;
  params: Params;
  data: ResultsData;
  empty?: React.ReactNode;
  /** The page's own controls, on the sort row before the sorts. */
  controls?: React.ReactNode;
  /** Rendered opposite the sort links -- tabs, or a count. */
  action?: React.ReactNode;
  /** False where the page puts the narrow-screen sort menu elsewhere. */
  sortMenu?: boolean;
}) {
  return (
    <Collecting type={type}>
      <div className="flex flex-col gap-4">
        {/* One row if it fits, else one group per line (sized by the row
            itself). Select sits top right, or below the page's own controls. */}
        <div
          // By page, not type: a catalog page's tabs change the type.
          style={still(`controls${path}`)}
          className={cn(
            // A stacking context (transition layer, container query): raised
            // so its menus open over the results.
            'relative z-10 @container',
            // A phone shows the row only for Select, when signed in.
            !sortMenu && !controls && !action && 'hidden has-[[data-select]]:block sm:block',
          )}
        >
          <div
            className={cn(
              'flex gap-3',
              controls
                ? 'flex-col @min-[68rem]:flex-row @min-[68rem]:items-center'
                : 'items-start @min-[68rem]:items-center',
            )}
          >
            {/* Stacked, the labels share one width so the controls line up. */}
            <div className="flex min-w-0 flex-1 flex-col items-start gap-2 @max-[68rem]:[&_[data-control-label]]:w-20 @min-[68rem]:flex-row @min-[68rem]:items-center @min-[68rem]:gap-x-5">
              {controls}
              <SortLinks
                path={path}
                params={params}
                sorts={LIST[type].sorts}
                active={data.sort}
                reverse={data.reverse}
                menu={sortMenu}
              />
            </div>
            <div
              className={cn(
                'flex shrink-0 items-center gap-3 empty:hidden',
                controls && 'self-end @min-[68rem]:self-auto',
              )}
            >
              {action}
              <SelectToggle />
            </div>
          </div>
        </div>

        {data.failure ? (
          <p className="rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2 text-sm text-red-300">
            {data.failure}
          </p>
        ) : data.rows.length === 0 ? (
          <p className="py-12 text-center text-sm text-muted">{empty}</p>
        ) : (
          <div data-results className="flex flex-col gap-4">
            <Results type={type} rows={data.rows} />
            <Pagination
              path={path}
              params={params}
              page={data.page}
              count={data.count}
              pageSize={PAGE_SIZE}
            />
          </div>
        )}
      </div>
    </Collecting>
  );
}

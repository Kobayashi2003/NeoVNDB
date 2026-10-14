/** One page of results with its sort and paging controls. Shared by the
 *  listings and the catalogue pages; `path` is where its links point. */

import { LIST, PAGE_SIZE } from '@/lib/list';
import { cn } from '@/lib/utils';
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
        {/* One row that wraps: each group stays whole and drops to the next
            line entire, rather than a label parting from what it labels. */}
        <div
          className={cn(
            'flex flex-wrap items-center gap-x-5 gap-y-2',
            // A phone shows the row only for Select, when signed in.
            !sortMenu && !controls && !action && 'hidden has-[[data-select]]:flex sm:flex',
          )}
        >
          {controls}
          <SortLinks
            path={path}
            params={params}
            sorts={LIST[type].sorts}
            active={data.sort}
            reverse={data.reverse}
            menu={sortMenu}
          />
          <div className="ml-auto flex items-center gap-3">
            {action}
            <SelectToggle />
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

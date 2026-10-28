/** A listing of one type. All state is in the address; every parameter the
 *  API does not reserve (f= included) is passed through as a filter. */

import { FILTERS } from '@/lib/filters';
import { filtersOf, withParams, type Params } from '@/lib/href';
import { LIST } from '@/lib/list';
import { fetchResults } from '@/lib/results';
import { still } from '@/lib/viewTransitions';
import { DataAge } from '@/components/layout/DataAge';
import { FilterBar } from './FilterBar';
import { ResultsPanel } from '@/components/results/ResultsPanel';
import { SavedSearches } from './SavedSearches';
import { SearchBox } from './SearchBox';

export async function ListPage({ type, params }: { type: string; params: Params }) {
  const path = `/${type}`;
  const filters = filtersOf(params);
  const search = filters.search ?? '';
  const data = await fetchResults(type, params, filters);

  return (
    <main className="mx-auto flex w-full max-w-page flex-col gap-4 px-4 py-4 pb-12">
      {/* Still across pages of results; raised so the filter menus and the
          condition builder open over what follows. */}
      <div style={still(`head${path}`)} className="relative z-20 flex flex-col gap-4">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h1 className="text-xl font-bold sm:text-2xl">
            {LIST[type].label}
            {!data.failure && (
              <span className="ml-2 text-sm font-normal tabular-nums text-muted">
                {data.count.toLocaleString()}
              </span>
            )}
          </h1>
          <div className="flex w-full items-center gap-2 sm:w-auto">
            <SearchBox path={path} params={params} initial={search} />
            <SavedSearches type={type} params={params} />
          </div>
        </div>

        <FilterBar
          type={type}
          path={path}
          params={params}
          filters={FILTERS[type] ?? []}
          sort={{ sorts: LIST[type].sorts, active: data.sort, reverse: data.reverse }}
        />
      </div>

      <ResultsPanel
        type={type}
        path={path}
        params={params}
        data={data}
        sortMenu={false}
        empty={
          <>
            Nothing matched.{' '}
            {search && (
              <a
                href={withParams(path, params, { search: null, page: null })}
                className="text-accent hover:underline"
              >
                Clear the search
              </a>
            )}
          </>
        }
      />

      <DataAge />
    </main>
  );
}

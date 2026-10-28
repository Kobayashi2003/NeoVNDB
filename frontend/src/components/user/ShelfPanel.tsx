/** A set of saved ids -- a list, or what the reader rated -- drawn as results.
 *  How a page of it is read is lib/shelf.ts. The last answer stays on screen,
 *  dimmed, while the next is fetched, so paging or re-sorting changes the
 *  results and nothing around them. */
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ListChecks } from 'lucide-react';
import { LIST, PAGE_SIZE, readsDown, type Sort } from '@/lib/list';
import { one, withParams, type Params } from '@/lib/href';
import { readShelf, type OwnSort, type ShelfPage, type ShelfSource } from '@/lib/shelf';
import { errorText } from '@/lib/user';
import { Results } from '@/components/results/Results';
import { Pagination } from '@/components/results/Pagination';
import { SortLinks } from '@/components/results/SortLinks';
import { Selectable } from '@/components/ui/Selection';
import { useNavigate } from '@/hooks/useNavigate';
import { useShelfChoice, type Choosing } from '@/hooks/useShelfChoice';
import { Missing, Rated, SearchInList } from './ShelfParts';

interface Held extends ShelfPage {
  /** The request this answers; while it differs from the one wanted, the
   *  rows on screen are the previous answer. */
  key: string;
}

export function ShelfPanel({
  type,
  source,
  sourceKey,
  own,
  path,
  params,
  page,
  title,
  aside,
  tabs,
  empty,
  bar,
  reloads = 0,
  noun,
}: {
  /** The vndb type letter of what is held; null until known. */
  type: string | null;
  source: ShelfSource;
  /** Names the set: a new one drops the selection and leaves select mode. */
  sourceKey: string;
  /** The service's own orders, the default first. */
  own: OwnSort[];
  path: string;
  params: Params;
  page: number;
  title: React.ReactNode;
  /** Beside the title: a list picker. */
  aside?: React.ReactNode;
  /** A row of its own under the title, where it may wrap: type tabs. */
  tabs?: React.ReactNode;
  empty: React.ReactNode;
  bar: (c: Choosing) => React.ReactNode;
  /** Bumped by the caller to read again after a change of its own. */
  reloads?: number;
  /** What the set is called in sentences: "this list", "your ratings". */
  noun: string;
}) {
  const navigate = useNavigate();
  const search = one(params, 'q') ?? '';
  const sort = one(params, 'sort') ?? own[0].value;
  const ownSort = own.find(s => s.value === sort);
  // Each sort has its own default direction.
  const asked = one(params, 'reverse');
  const reverse =
    asked !== undefined
      ? asked === 'true'
      : readsDown([...own, ...(type ? LIST[type].sorts : [])], sort);

  const [held, setHeld] = useState<Held | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mine, setMine] = useState(0);
  const rows = held?.rows ?? [];
  const here = rows.map(r => r.id);
  const choice = useShelfChoice(sourceKey, here, () => setMine(n => n + 1));

  const want = `${sourceKey}|${page}|${sort}|${reverse}|${search}|${reloads}|${mine}`;

  useEffect(() => {
    if (!type) return;
    let live = true;

    readShelf({ type, source, own, sort, reverse, search, page }).then(
      got => {
        if (!live) return;
        // Removing the last items can leave the reader past the end.
        const last = Math.max(1, Math.ceil(got.count / PAGE_SIZE));
        if (page > last) {
          navigate.replace(withParams(path, params, { page: last === 1 ? null : String(last) }));
          return;
        }
        setHeld({ ...got, key: want });
        setError(null);
      },
      err => {
        if (live) setError(errorText(err));
      },
    );
    return () => {
      live = false;
    };
    // `want` names every input; the functions and objects behind it change
    // identity on each render without changing what they ask for.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [want, type]);

  if (error && !held) {
    return (
      <div className="w-full max-w-sm rounded-lg border border-white/5 bg-surface p-6 text-sm">
        <p role="alert" className="text-red-400">
          {error}
        </p>
        <Link href="/u" className="mt-3 inline-block text-accent hover:underline">
          All lists
        </Link>
      </div>
    );
  }

  const stale = !held || held.key !== want;
  const shownType = type ?? 'v';
  const sorts: Sort[] = [...own, ...(held?.tooBig ? [] : LIST[shownType].sorts)];
  // Highlight the order actually used, not the one in the address.
  const showing = held?.tooBig && !ownSort ? own[0].value : sort;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <h1 className="truncate text-xl font-bold sm:text-2xl">{title}</h1>
          {held && (
            <span className="shrink-0 text-sm tabular-nums text-muted">
              {held.count.toLocaleString()}
            </span>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {aside}
          {rows.length > 0 && !choice.selecting && (
            <button
              type="button"
              onClick={choice.start}
              className="flex items-center gap-1 rounded-full px-2 py-1.5 text-xs text-muted transition-colors hover:bg-white/10 hover:text-white"
            >
              <ListChecks className="icon-text h-3.5 w-3.5" aria-hidden />
              Select
            </button>
          )}
        </div>
      </div>

      {tabs}

      {(held === null || held.count > 0 || search) && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SortLinks path={path} params={params} sorts={sorts} active={showing} reverse={reverse} />
          <SearchInList path={path} params={params} initial={search} noun={noun} />
        </div>
      )}

      {held?.missing ? (
        <Missing
          count={held.missing}
          noun={noun}
          order={own[0].label}
          href={withParams(path, params, { sort: null, reverse: null, page: null })}
        />
      ) : null}
      {held?.tooBig && (
        <p className="text-xs text-muted">
          This is longer than can be ordered by vndb&apos;s fields or searched here, so only{' '}
          {own.map(s => s.label.toLowerCase()).join(' and ')} work.
        </p>
      )}
      {error && (
        <p role="alert" className="text-xs text-red-400">
          {error}
        </p>
      )}

      {held === null ? (
        // Keyed apart from the results, so they arrive as a new element rather
        // than as this one moved and grown, which counts as a layout shift.
        <div
          key="waiting"
          className="h-64 w-full animate-pulse rounded-lg bg-white/5"
          aria-hidden
        />
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted">
          {search ? (
            <>
              Nothing in {noun} matches that.{' '}
              <Link
                href={withParams(path, params, { q: null, page: null })}
                className="text-accent hover:underline"
              >
                Clear the search
              </Link>
              .
            </>
          ) : (
            empty
          )}
        </p>
      ) : (
        <div
          key="results"
          data-results
          data-stale={stale || undefined}
          className="flex flex-col gap-4"
        >
          <Results
            type={shownType}
            rows={rows}
            wrap={card => {
              const r = held.ratings.get(card.id);
              const node = r ? (
                <Rated rating={r} grid={card.grid}>
                  {card.node}
                </Rated>
              ) : (
                card.node
              );
              return (
                <Selectable
                  active={choice.selecting}
                  on={choice.chosen.includes(card.id)}
                  grid={card.grid}
                  onToggle={() => choice.toggle(card.id)}
                >
                  {node}
                </Selectable>
              );
            }}
          />
          <Pagination
            path={path}
            params={params}
            page={page}
            count={held.count}
            pageSize={PAGE_SIZE}
          />
        </div>
      )}

      {choice.selecting && bar(choice.bar)}
    </div>
  );
}

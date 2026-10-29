/** One list. Its name and type come from the lists the column already holds,
 *  so switching lists changes the heading at once; the items follow. */
'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { LIST } from '@/lib/list';
import { items, marks, moveMarks, removeMarks, type Mark } from '@/lib/user';
import type { Params } from '@/lib/href';
import { refreshCollections, useCollections } from '@/hooks/useCollections';
import type { Owned, OwnSort, ShelfSource } from '@/lib/shelf';
import { ShelfPanel } from './ShelfPanel';
import { SelectBar } from './SelectBar';
import { CollectionPicker } from './CollectionSwitcher';

/** The orders only the user service knows. */
const OWN: OwnSort[] = [
  { value: 'added', by: 'added', label: 'Added', descending: true, dated: true },
  { value: 'mine', by: 'rating', label: 'My rating', descending: true },
];

const owned = (m: Mark): Owned => ({ id: m.id, rating: m.rating, at: m.marked_at });

export function CollectionPanel({
  id,
  page,
  params,
}: {
  id: number;
  page: number;
  params: Params;
}) {
  const { lists, error } = useCollections(true);
  const list = lists?.find(l => l.id === id);

  const source = useMemo<ShelfSource>(
    () => ({
      page: (order, p, limit) =>
        marks(id, order, p, limit).then(r => ({ rows: r.results.map(owned), count: r.count })),
      all: order => items(id, order).then(r => ({ items: r.items.map(owned), count: r.count })),
    }),
    [id],
  );

  if (lists && !list) {
    return <p className="text-sm text-red-400">{error ?? 'No such list.'}</p>;
  }

  return (
    <ShelfPanel
      type={list?.type ?? null}
      source={source}
      sourceKey={`list:${id}`}
      own={OWN}
      path={`/u/${id}`}
      params={params}
      page={page}
      noun="this list"
      title={list?.name ?? ' '}
      aside={lists && <CollectionPicker lists={lists} current={id} className="lg:hidden" />}
      empty={
        <>
          Nothing on this list yet. Saving something from its own page puts it here
          {list && (
            <>
              {' -- '}
              <Link href={`/${list.type}`} className="text-accent hover:underline">
                browse {LIST[list.type].label.toLowerCase()}
              </Link>
            </>
          )}
          .
        </>
      }
      bar={c => (
        <SelectBar
          chosen={c.chosen.length}
          pageSize={c.here.length}
          allOnPage={c.allOnPage}
          lists={(lists ?? []).filter(l => l.type === list?.type && l.id !== id)}
          busy={c.busy}
          error={c.error}
          onAll={c.onAll}
          onMove={to => c.act(() => moveMarks(id, to, c.chosen).then(refreshCollections))}
          onRemove={() => c.act(() => removeMarks(id, c.chosen).then(refreshCollections))}
          onClose={c.onClose}
        />
      )}
    />
  );
}

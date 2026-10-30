/** Everything the reader rated, one type at a time, for changing ratings in
 *  bulk. A rating belongs to an item, not to a list, so this is the one place
 *  that shows every one of them. */
'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Star } from 'lucide-react';
import {
  clearRatings,
  ratedItems,
  ratingCounts,
  ratings,
  setRatings,
  type Rated,
} from '@/lib/user';
import { one, withParams, type Params } from '@/lib/href';
import { LIST, TYPES } from '@/lib/list';
import { useSession } from '@/hooks/useSession';
import { pill } from '@/components/ui/Pill';
import type { Owned, OwnSort, ShelfSource } from '@/lib/shelf';
import { Placeholder } from '@/components/ui/Surface';
import { ShelfPanel } from './ShelfPanel';
import { RatingsBar } from './RatingsBar';
import { SignInFirst } from './SignInFirst';

const PATH = '/u/ratings';

/** The orders only the user service knows. */
const OWN: OwnSort[] = [
  { value: 'mine', by: 'rating', label: 'My rating', descending: true },
  { value: 'rated', by: 'rated', label: 'Rated on', descending: true, dated: true },
];

const owned = (r: Rated): Owned => ({ id: r.id, rating: r.rating, at: r.rated_at });

export function RatingsPanel({ page, params }: { page: number; params: Params }) {
  const session = useSession();
  if (session.status === 'unknown') {
    return <Placeholder className="h-64 w-full" />;
  }
  if (session.status === 'out') {
    return (
      <SignInFirst next={PATH} icon={Star} title="Your ratings live here">
        Rate what you have read, then sort and change those ratings together.
      </SignInFirst>
    );
  }
  return <Ratings page={page} params={params} />;
}

function Ratings({ page, params }: { page: number; params: Params }) {
  const asked = one(params, 'type') ?? 'v';
  const type = (TYPES as readonly string[]).includes(asked) ? asked : 'v';
  const [counts, setCounts] = useState<Record<string, number> | null>(null);
  const [changes, setChanges] = useState(0);

  useEffect(() => {
    let live = true;
    ratingCounts().then(
      got => {
        if (live) setCounts(got);
      },
      () => {},
    );
    return () => {
      live = false;
    };
  }, [changes]);

  const source = useMemo<ShelfSource>(
    () => ({
      page: (order, p, limit) =>
        ratings(type, order, p, limit).then(r => ({ rows: r.results.map(owned), count: r.count })),
      all: order =>
        ratedItems(type, order).then(r => ({ items: r.items.map(owned), count: r.count })),
    }),
    [type],
  );

  return (
    <ShelfPanel
      type={type}
      source={source}
      sourceKey={`ratings:${type}`}
      own={OWN}
      path={PATH}
      params={params}
      page={page}
      noun="your ratings"
      title="Your ratings"
      reloads={changes}
      tabs={
        <nav aria-label="Kinds rated" className="flex flex-wrap gap-1">
          {TYPES.map(t => (
            <Link
              key={t}
              href={withParams(PATH, params, {
                type: t === 'v' ? null : t,
                page: null,
                sort: null,
                reverse: null,
                q: null,
              })}
              aria-current={t === type ? 'page' : undefined}
              className={pill({ tone: t === type ? 'on' : 'quiet', className: 'gap-1.5 px-2.5' })}
            >
              {LIST[t].label}
              {counts?.[t] ? <span className="tabular-nums text-muted">{counts[t]}</span> : null}
            </Link>
          ))}
        </nav>
      }
      empty={`No ${LIST[type].label.toLowerCase()} rated yet. Rate one from its own page and it shows up here.`}
      bar={c => (
        <RatingsBar
          chosen={c.chosen.length}
          pageSize={c.here.length}
          allOnPage={c.allOnPage}
          busy={c.busy}
          error={c.error}
          onAll={c.onAll}
          onRate={value =>
            c.act(() => setRatings(c.chosen, value).then(() => setChanges(n => n + 1)))
          }
          onClear={() => c.act(() => clearRatings(c.chosen).then(() => setChanges(n => n + 1)))}
          onClose={c.onClose}
        />
      )}
    />
  );
}

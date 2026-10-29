/** What to read next: titles alike, by their tags, to the ones in scope,
 *  counting a well-rated one more and a disliked one against, leaving out
 *  everything the reader already holds. Each says which of theirs led to it. */
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { list, recommend, type Pick } from '@/lib/api';
import { MAX_IDS, weight, type Detail, type Entry } from '@/lib/dashboard';
import { display } from '@/lib/format';
import { LIST } from '@/lib/list';
import { usePrefs } from '@/hooks/usePrefs';
import type { Holdings } from '@/hooks/useHoldings';
import { Results } from '@/components/results/Results';
import type { VNRow } from '@/lib/types';
import { Placeholder } from '@/components/ui/Surface';
import { Block, Plot } from './Block';

const COUNT = 12;

export function Recommendations({
  scope,
  held,
  details,
}: {
  scope: Entry[];
  held: Holdings;
  details: Map<string, Detail>;
}) {
  const { original } = usePrefs();
  const from = scope.map(e => ({ id: e.id, weight: weight(e.rating) }));
  const key = from.map(f => `${f.id}:${f.weight}`).join(',');
  const [got, setGot] = useState<{ key: string; picks: Pick[]; rows: VNRow[] } | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!key) return;
    let live = true;
    // Everything held, not only what is in scope: a title on another list is
    // not news. Up to the API's id ceiling.
    const owned = [
      ...new Set([
        ...held.lists.flatMap(l => l.marks.map(m => m.id)),
        ...held.rated.map(r => r.id),
      ]),
    ].slice(0, MAX_IDS);
    const wanted = key.split(',').map(part => {
      const [id, w] = part.split(':');
      return { id, weight: Number(w) };
    });
    (async () => {
      const picks = await recommend(wanted, owned, COUNT);
      if (picks.length === 0) return { picks, rows: [] };
      const page = await list<VNRow>('vn', {
        fields: LIST.v.fields,
        filters: { id: picks.map(p => p.id).join(',') },
      });
      const byId = new Map(page.results.map(r => [r.id, r]));
      return { picks, rows: picks.map(p => byId.get(p.id)).filter((r): r is VNRow => !!r) };
    })().then(
      next => {
        if (!live) return;
        setGot({ key, ...next });
        setFailed(false);
      },
      () => live && setFailed(true),
    );
    return () => {
      live = false;
    };
  }, [key, held]);

  const because = new Map(got?.picks.map(p => [p.id, p.because]) ?? []);
  const name = (id: string) => {
    const d = details.get(id);
    return d ? display(d.title, d.alttitle, original) || id : id;
  };

  return (
    <Block title="You might like">
      {failed ? (
        <p className="text-xs text-red-400">Recommendations could not be worked out.</p>
      ) : !got ? (
        <Placeholder className="h-64" />
      ) : got.rows.length === 0 ? (
        <Plot>
          <p className="text-center text-xs text-muted">
            Nothing alike that you do not have already.
          </p>
        </Plot>
      ) : (
        <div className={got.key === key ? undefined : 'opacity-60'}>
          <Results
            type="v"
            rows={got.rows}
            wrap={card => (
              <div className="flex flex-col gap-1">
                {card.node}
                <p className="line-clamp-2 text-[0.6875rem] text-muted">
                  Like{' '}
                  {(because.get(card.id) ?? []).slice(0, 2).map((id, i) => (
                    <span key={id}>
                      {i > 0 && ', '}
                      <Link href={`/${id}`} className="text-white/80 hover:text-accent">
                        {name(id)}
                      </Link>
                    </span>
                  ))}
                </p>
              </div>
            )}
          />
        </div>
      )}
    </Block>
  );
}

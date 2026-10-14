/** Finding one entity by name for the condition builder, and showing the name
 *  of one already chosen. Typing a full id (g749) uses it as-is. */
'use client';

import { useEffect, useState } from 'react';
import { list } from '@/lib/api';
import { LIST } from '@/lib/list';
import { NOUN } from '@/lib/conditions';
import { display } from '@/lib/format';
import { usePrefs } from '@/hooks/usePrefs';
import { menuItem } from '@/components/ui/Menu';
import { SearchBox } from './parts';

interface Named {
  id: string;
  title?: string;
  alttitle?: string | null;
  name?: string;
  original?: string | null;
  translation?: { name: string | null } | null;
}

/** A name and its other form, which original mode shows: the original
 *  script, or for tags and traits the translation. */
type Pair = [string, string | null];

const nameFields = (type: string) =>
  type === 'v' || type === 'r'
    ? 'title,alttitle'
    : type === 'g' || type === 'i'
      ? 'name,translation.name'
      : 'name,original';

const pairOf = (row: Named): Pair => [
  row.title ?? row.name ?? row.id,
  row.alttitle ?? row.original ?? row.translation?.name ?? null,
];

/** Names already looked up, shared by every chip on the page. */
const names = new Map<string, Pair>();

/** The display name of an id, or the id until it arrives. */
export function useEntityName(type: string, id: string): string {
  const [, loaded] = useState(0);
  const { original } = usePrefs();

  useEffect(() => {
    if (!id || names.has(id)) return;
    let live = true;
    list<Named>(LIST[type].type, { fields: nameFields(type), limit: 1, filters: { id } }).then(
      page => {
        const row = page.results[0];
        if (row) names.set(row.id, pairOf(row));
        if (live) loaded(n => n + 1);
      },
      () => {},
    );
    return () => {
      live = false;
    };
  }, [type, id]);

  const pair = names.get(id);
  return pair ? display(pair[0], pair[1], original) || pair[0] : id;
}

/** A search box with its results listed underneath, for inside a popover. */
export function EntitySearch({ type, onPick }: { type: string; onPick: (id: string) => void }) {
  const [term, setTerm] = useState('');
  const [hits, setHits] = useState<{ for: string; rows: Named[] }>({ for: '', rows: [] });
  const { original } = usePrefs();
  const q = term.trim();
  const asID = new RegExp(`^${type}\\d+$`, 'i').test(q);

  useEffect(() => {
    if (q.length < 2) return;
    let live = true;
    const timer = setTimeout(() => {
      list<Named>(LIST[type].type, {
        fields: nameFields(type),
        limit: 8,
        sort: 'searchrank',
        reverse: true,
        filters: { search: q },
      }).then(
        page => {
          for (const row of page.results) names.set(row.id, pairOf(row));
          if (live) setHits({ for: q, rows: page.results });
        },
        () => live && setHits({ for: q, rows: [] }),
      );
    }, 250);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [type, q]);

  const rows = hits.for === q && q.length >= 2 ? hits.rows : [];
  const pick = (id: string) => onPick(id.toLowerCase());

  return (
    <div className="flex flex-col">
      <SearchBox
        value={term}
        onChange={setTerm}
        label={`Find a ${NOUN[type]}`}
        onEnter={() => {
          if (asID) pick(q);
          else if (rows[0]) pick(rows[0].id);
        }}
      />
      {asID && (
        <button type="button" onClick={() => pick(q)} className={menuItem()}>
          Use <span className="font-mono">{q.toLowerCase()}</span>
        </button>
      )}
      {rows.map(row => (
        <button key={row.id} type="button" onClick={() => pick(row.id)} className={menuItem()}>
          <span className="truncate">{display(...pairOf(row), original)}</span>
          <span className="ml-auto shrink-0 font-mono text-[0.6875rem] text-muted">{row.id}</span>
        </button>
      ))}
      {q.length >= 2 && hits.for === q && rows.length === 0 && !asID && (
        <p className="px-2.5 py-1.5 text-xs text-muted">Nothing found.</p>
      )}
      {q.length < 2 && <p className="px-2.5 py-1.5 text-xs text-muted">Type a name or an id.</p>}
    </div>
  );
}

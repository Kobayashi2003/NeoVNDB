/** The reader's dashboard: what came into their lists when, what those
 *  titles have in common, how they rated them, and what to read next. One row
 *  of choices scopes every section: which titles (every list, one list, or
 *  what they rated), over what stretch of time, counted by year, month or day.
 *  Picking a column in a chart narrows every other section to the titles under
 *  it, and the titles column beside the charts lists them. */
'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { LayoutDashboard, X } from 'lucide-react';
import { list, vnStats, type VNStats } from '@/lib/api';
import { LIST } from '@/lib/list';
import {
  bounds,
  buckets,
  calendar,
  defaultGrain,
  fromLists,
  grains,
  inRange,
  narrow,
  tally,
  years,
  MAX_IDS,
  type Detail,
  type Entry,
  type Facet,
  type Grain,
  type Picks,
  type Range,
} from '@/lib/dashboard';
import { enumLabel } from '@/lib/enums';
import { cn } from '@/lib/utils';
import { usePrefs } from '@/hooks/usePrefs';
import { useHoldings } from '@/hooks/useHoldings';
import { useSession } from '@/hooks/useSession';
import { SignInFirst } from '@/components/user/SignInFirst';
import { ChoiceMenu, type MenuChoice } from '@/components/ui/ChoiceMenu';
import { ControlLabel } from '@/components/ui/ControlLabel';
import { Segmented } from '@/components/ui/Segmented';
import { floating, Placeholder, surface } from '@/components/ui/Surface';
import { Block, Plot } from './Block';
import { Columns } from './Columns';
import { Calendar } from './Calendar';
import { Summary } from './Summary';
import { Disagreements } from './Disagreements';
import { Recommendations } from './Recommendations';
import { TitleList } from './TitleList';
import {
  columnsOf,
  Languages,
  Lengths,
  MyRatings,
  ReleaseYears,
  StaffBlock,
  TagsBlock,
  TallyBlock,
} from './Facets';

const FIELDS = `${LIST.v.fields},olang`;
const CHUNK = 200;

const GRAIN: Record<Grain, string> = { year: 'Year', month: 'Month', day: 'Day' };

/** Two sections side by side from lg up, their surfaces stretched to the
 *  taller so the pair ends on one line. */
const PAIR =
  'grid gap-x-6 gap-y-8 lg:grid-cols-2 [&>section]:flex [&>section]:flex-col [&>section>:last-child]:flex-1 [&>section>h2]:min-h-7';

export function Dashboard() {
  const session = useSession();
  if (session.status === 'unknown') return <Placeholder className="h-96" />;
  if (session.status === 'out') {
    return (
      <SignInFirst next="/u/ratings" icon={LayoutDashboard} title="Your dashboard lives here">
        What you have added and rated, counted up, and what to read next.
      </SignInFirst>
    );
  }
  return <Board />;
}

function Board() {
  const { held, error } = useHoldings();
  const { original, sexual } = usePrefs();
  const [source, setSource] = useState('all');
  const [range, setRange] = useState<Range>('all');
  // Null until the reader picks one: the grain then follows the range.
  const [chosen, setChosen] = useState<Grain | null>(null);
  const [picks, setPicks] = useState<Picks>({});
  const today = useMemo(() => new Date(), []);
  const [bar, barHeight] = useHeight();

  const ratings = useMemo(() => new Map(held?.rated.map(r => [r.id, r.rating]) ?? []), [held]);
  const entries = useMemo<Entry[]>(() => {
    if (!held) return [];
    if (source === 'rated')
      return held.rated.map(r => ({ id: r.id, at: r.rated_at, rating: r.rating }));
    const lists =
      source === 'all' ? held.lists : held.lists.filter(l => `list:${l.list.id}` === source);
    return fromLists(
      lists.map(l => l.marks),
      ratings,
    );
  }, [held, source, ratings]);
  const scope = useMemo(
    () => inRange(entries, range, today).sort((a, b) => b.at.localeCompare(a.at)),
    [entries, range, today],
  );
  const details = useDetails(useMemo(() => scope.slice(0, MAX_IDS).map(e => e.id), [scope]));
  const picked = useMemo(() => narrow(scope, details, picks), [scope, details, picks]);
  const ids = useMemo(() => picked.slice(0, MAX_IDS).map(e => e.id), [picked]);
  const { stats, stale } = useStats(ids);

  if (error) return <p className="text-sm text-red-400">{error}</p>;
  if (!held) return <Placeholder className="h-96" />;
  if (held.lists.every(l => l.marks.length === 0) && held.rated.length === 0) {
    return (
      <p className={surface('p-6 text-sm text-muted')}>
        Nothing to count yet. Add visual novels to a list or rate them, and this fills in.
      </p>
    );
  }

  const grain = chosen && grains(range).includes(chosen) ? chosen : defaultGrain(range, entries);
  const pick =
    <F extends Facet>(facet: F) =>
    (value: Picks[F]) =>
      setPicks(now => ({ ...now, [facet]: value }));
  // Each chart counts what every pick but its own lets through.
  const without = (facet: Facet) => narrow(scope, details, picks, facet);
  const rowsOf = (entries: Entry[]) =>
    entries.map(e => details.get(e.id)).filter((d): d is Detail => !!d);
  const came = source === 'rated' ? 'Rated' : 'Added';
  const dates = without('added').map(e => e.at);
  const counting = stale || ids.some(id => !details.has(id));

  const sources: MenuChoice<string>[] = [
    { value: 'all', label: 'Every list' },
    ...held.lists.map(({ list: l, marks }) => ({
      value: `list:${l.id}`,
      label: l.name,
      count: marks.length,
      group: 'Lists',
    })),
    { value: 'rated', label: 'Rated', count: held.rated.length },
  ];
  const ranges: MenuChoice<Range>[] = [
    { value: 'all', label: 'All time' },
    { value: '12m', label: 'The last 12 months' },
    ...years(entries).map(y => ({ value: `${y}` as Range, label: String(y), group: 'Years' })),
  ];

  return (
    <div
      className="flex flex-col gap-8"
      style={{ '--bar-h': `${barHeight}px` } as React.CSSProperties}
    >
      {/* Pinned from sm up, so the picks stay in sight while their effect is
          read further down; on a phone it would take a fifth of the screen. */}
      <div
        ref={bar}
        className={floating('z-30 flex flex-col gap-2 px-3 py-2 sm:sticky sm:top-(--header-h)')}
      >
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <div className="flex min-w-0 items-center gap-1">
            <ControlLabel>Titles</ControlLabel>
            <ChoiceMenu
              label="Titles"
              value={source}
              choices={sources}
              onChange={s => {
                setSource(s);
                setPicks({});
              }}
            />
          </div>
          <div className="flex items-center gap-1">
            <ControlLabel>Over</ControlLabel>
            <ChoiceMenu
              label="Over"
              value={range}
              choices={ranges}
              onChange={r => {
                setRange(r);
                setChosen(null);
                setPicks(now => ({ ...now, added: undefined }));
              }}
            />
          </div>
          <div className="flex items-center gap-1">
            <ControlLabel>By</ControlLabel>
            <Segmented
              label="Count by"
              value={grain}
              onChange={g => {
                setChosen(g);
                setPicks(now => ({ ...now, added: undefined }));
              }}
              options={grains(range).map(g => ({ value: g, label: GRAIN[g] }))}
            />
          </div>
        </div>
        <Chips
          picks={picks}
          came={came}
          left={picked.length}
          of={scope.length}
          onClear={setPicks}
        />
      </div>

      {/* From xl the titles are a column beside the charts, pinned under the
          bar and scrolling on their own; below, they follow the charts. */}
      <div className="grid grid-cols-1 gap-8 xl:grid-cols-[minmax(0,1fr)_19rem] xl:items-start">
        <div className="flex min-w-0 flex-col gap-8">
          <Summary scope={picked} details={details} />
          {scope.length > MAX_IDS && (
            <p className="-mt-6 text-xs text-muted">
              What they have in common is counted over the latest {MAX_IDS.toLocaleString()}.
            </p>
          )}

          <Block
            title={came}
            table={{
              head: [GRAIN[grain], 'Titles'],
              rows:
                grain === 'day' ? days(dates) : buckets(dates, grain).map(b => [b.key, b.count]),
            }}
          >
            <Plot>
              {grain === 'day' ? (
                <Calendar
                  weeks={calendar(dates, bounds(range, today).to)}
                  unit="titles"
                  picked={picks.added}
                  onPick={pick('added')}
                />
              ) : (
                <Columns
                  data={columnsOf(dates, grain, bounds(range, today))}
                  unit="titles"
                  label={`Titles by ${grain} ${came.toLowerCase()}`}
                  picked={picks.added}
                  onPick={pick('added')}
                />
              )}
            </Plot>
          </Block>

          <div className={PAIR}>
            <ReleaseYears
              rows={rowsOf(without('released'))}
              picked={picks.released}
              onPick={pick('released')}
            />
            <MyRatings scope={without('rating')} picked={picks.rating} onPick={pick('rating')} />
          </div>

          <div className={PAIR}>
            <Lengths
              rows={rowsOf(without('length'))}
              picked={picks.length}
              onPick={pick('length')}
            />
            <Languages
              rows={rowsOf(without('olang'))}
              picked={picks.olang}
              onPick={pick('olang')}
            />
          </div>

          <Disagreements scope={picked} details={details} original={original} />

          <div className={cn(PAIR, 'transition-opacity', counting && 'opacity-60')}>
            <TallyBlock title="Developers" tallies={stats?.developers} original={original} />
            <TallyBlock title="Publishers" tallies={stats?.publishers} original={original} />
          </div>
          <div className={cn(PAIR, 'transition-opacity', counting && 'opacity-60')}>
            <StaffBlock staff={stats?.staff} original={original} />
            <TagsBlock tags={stats?.tags} original={original} sexual={sexual === 'explicit'} />
          </div>
        </div>

        <TitleList
          scope={picked}
          details={details}
          came={came}
          className="max-h-[36rem] xl:sticky xl:top-[calc(var(--header-h)+var(--bar-h)+1rem)] xl:max-h-[calc(100dvh-var(--header-h)-var(--bar-h)-2rem)]"
        />
      </div>

      <Recommendations scope={picked.slice(0, MAX_IDS)} held={held} details={details} />
    </div>
  );
}

/** A ref and the height of what it is put on, kept current as that changes. */
function useHeight(): [React.RefObject<HTMLDivElement | null>, number] {
  const ref = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const seen = new ResizeObserver(() => setHeight(el.offsetHeight));
    seen.observe(el);
    return () => seen.disconnect();
  }, []);
  return [ref, height];
}

/** Titles fetched for the ids in scope, a chunk at a time, kept across changes
 *  of scope so going back to one costs nothing. */
function useDetails(ids: string[]): Map<string, Detail> {
  const [known, setKnown] = useState<Map<string, Detail>>(() => new Map());
  const asked = useRef(new Set<string>());
  useEffect(() => {
    const missing = ids.filter(id => !asked.current.has(id));
    for (const id of missing) asked.current.add(id);
    for (let i = 0; i < missing.length; i += CHUNK) {
      const chunk = missing.slice(i, i + CHUNK);
      list<Detail>('vn', { fields: FIELDS, filters: { id: chunk.join(',') } }).then(
        page =>
          setKnown(now => {
            const next = new Map(now);
            for (const row of page.results) next.set(row.id, row);
            return next;
          }),
        () => {
          for (const id of chunk) asked.current.delete(id);
        },
      );
    }
  }, [ids]);
  return known;
}

/** What the titles in scope have in common; the last answer stays up, marked
 *  stale, while the next is asked for. */
function useStats(ids: string[]): { stats: VNStats | null; stale: boolean } {
  const key = ids.join(',');
  const [held, setHeld] = useState<{ key: string; stats: VNStats } | null>(null);
  useEffect(() => {
    if (!key) return;
    let live = true;
    vnStats(key.split(','), 10).then(
      stats => live && setHeld({ key, stats }),
      () => {},
    );
    return () => {
      live = false;
    };
  }, [key]);
  if (!key) return { stats: null, stale: false };
  return { stats: held?.stats ?? null, stale: held?.key !== key };
}

/** The picks in force, each a chip that drops it, and how many titles they
 *  leave. */
function Chips({
  picks,
  came,
  left,
  of,
  onClear,
}: {
  picks: Picks;
  came: string;
  left: number;
  of: number;
  onClear: (next: Picks) => void;
}) {
  const named: [Facet, string][] = [];
  if (picks.added) named.push(['added', `${came} ${picks.added}`]);
  if (picks.released) named.push(['released', `Released ${picks.released}`]);
  if (picks.rating) named.push(['rating', `Rated ★${picks.rating}`]);
  if (picks.length) named.push(['length', enumLabel('LENGTH', picks.length)]);
  if (picks.olang) named.push(['olang', `In ${enumLabel('LANGUAGE', picks.olang)}`]);
  if (named.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="mr-1 text-xs tabular-nums text-muted" aria-live="polite">
        <strong className="font-semibold text-white">{left.toLocaleString()}</strong> of{' '}
        {of.toLocaleString()} titles
      </span>
      {named.map(([facet, label]) => (
        <button
          key={facet}
          type="button"
          onClick={() => onClear({ ...picks, [facet]: undefined })}
          aria-label={`Stop narrowing to ${label}`}
          className="flex items-center gap-1 rounded-full border border-accent/40 bg-accent/10 py-0.5 pl-2.5 pr-1.5 text-xs text-white transition-colors hover:border-accent"
        >
          {label}
          <X className="size-3 text-muted" aria-hidden />
        </button>
      ))}
      {named.length > 1 && (
        <button
          type="button"
          onClick={() => onClear({})}
          className="px-1.5 text-xs text-muted transition-colors hover:text-white"
        >
          Clear all
        </button>
      )}
    </div>
  );
}

function days(dates: string[]): [string, number][] {
  return tally(dates.map(d => d.slice(0, 10)))
    .map(t => [t.value, t.count] as [string, number])
    .sort((a, b) => b[0].localeCompare(a[0]));
}

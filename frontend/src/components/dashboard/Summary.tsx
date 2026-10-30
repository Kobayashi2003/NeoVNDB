/** The dashboard's head: the few numbers that sum the titles in view, beside
 *  the covers of the latest of them, fanned like the end of a shelf. */
'use client';

import Link from 'next/link';
import { cn } from '@/lib/utils';
import { thumbnailURL } from '@/lib/images';
import { shouldBlur } from '@/lib/content';
import { display, score } from '@/lib/format';
import type { Detail, Entry } from '@/lib/dashboard';
import { usePrefs } from '@/hooks/usePrefs';
import { ImageWithFallback } from '@/components/ui/ImageWithFallback';
import { Rolling } from '@/components/ui/Rolling';
import { surface } from '@/components/ui/Surface';

const FAN = 7;

type Format = (n: number) => string;

export function Summary({ scope, details }: { scope: Entry[]; details: Map<string, Detail> }) {
  const rows = scope.map(e => details.get(e.id)).filter((d): d is Detail => !!d);
  const rated = scope.filter(e => e.rating !== null);
  const mine = rated.length ? rated.reduce((s, e) => s + e.rating!, 0) / rated.length : null;
  const scored = rows.filter(r => r.rating !== null);
  const theirs = scored.length ? scored.reduce((s, r) => s + r.rating!, 0) / scored.length : null;
  const timed = rows.filter(r => r.length_minutes);
  const hours = Math.round(timed.reduce((s, r) => s + r.length_minutes!, 0) / 60);
  const count = (n: number) => Math.round(n).toLocaleString();
  const figures: { label: string; value: number | null; format: Format; note?: string }[] = [
    { label: 'Titles', value: scope.length, format: count },
    {
      label: 'Rated',
      value: rated.length,
      format: count,
      note: scope.length ? `${Math.round((rated.length / scope.length) * 100)}%` : undefined,
    },
    { label: 'Your average', value: mine, format: n => `★${n.toFixed(2)}` },
    { label: 'vndb’s average', value: theirs, format: score },
    {
      label: 'Hours to read',
      value: hours,
      format: count,
      note: rows.length && timed.length < rows.length ? `${timed.length} timed` : undefined,
    },
  ];

  return (
    <div
      className={surface(
        'flex flex-col gap-5 p-4 sm:p-5 lg:flex-row lg:items-center lg:justify-between',
      )}
    >
      {/* Filling the row, so its columns are sized by the card and not by the
          figures, which count through every width on a change. The two with a
          note beside the figure get the room for it. */}
      <dl className="grid min-w-0 grid-cols-3 gap-x-4 gap-y-4 sm:gap-x-0 lg:flex-1 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.45fr)]">
        {figures.map((f, i) => (
          <div
            key={f.label}
            className={cn(
              'flex flex-col-reverse gap-1 sm:px-5 sm:first:pl-0',
              i > 0 && 'sm:border-l sm:border-white/10',
              // On a phone's three columns, room for the note beside it.
              i === figures.length - 1 && 'col-span-2 sm:col-span-1',
            )}
          >
            <dt className="text-xs text-muted">{f.label}</dt>
            <dd className="flex items-baseline gap-1.5 whitespace-nowrap">
              <span className="font-display text-2xl leading-none tracking-tight tabular-nums sm:text-[1.75rem]">
                {f.value === null ? '—' : <Rolling value={f.value} format={f.format} />}
              </span>
              {f.note && <span className="text-xs text-muted">{f.note}</span>}
            </dd>
          </div>
        ))}
      </dl>
      <Fan ids={scope.slice(0, FAN).map(e => e.id)} details={details} />
    </div>
  );
}

const SLOT =
  'block aspect-[2/3] w-14 overflow-hidden rounded-md bg-elevated shadow-[0_0_0_2px_var(--surface)] sm:w-16';

/** The latest covers, overlapping; the one under the pointer comes forward.
 *  A slot is held for each before its cover is known, so nothing moves. */
function Fan({ ids, details }: { ids: string[]; details: Map<string, Detail> }) {
  const { original, sexual, violence } = usePrefs();
  // Its height held with nothing to show, so the card does not shrink and
  // pull every section below it up when a pick or a range empties it.
  if (ids.length === 0) return <div className={cn(SLOT, 'invisible')} aria-hidden />;
  return (
    <ul aria-label="Latest titles" className="flex shrink-0">
      {ids.map((id, i) => {
        const r = details.get(id);
        const name = r ? display(r.title, r.alttitle, original) || id : id;
        const blur = !!r?.image && shouldBlur(r.image.sexual, r.image.violence, sexual, violence);
        return (
          <li
            key={id}
            className="z-(--z) -ml-7 first:ml-0 focus-within:z-50 hover:z-50 sm:-ml-8"
            style={{ '--z': ids.length - i } as React.CSSProperties}
          >
            <Link
              href={`/${id}`}
              title={name}
              aria-label={name}
              className={cn(
                SLOT,
                'hover:-translate-y-1.5 focus-visible:-translate-y-1.5 motion-safe:transition-transform motion-safe:duration-200',
              )}
            >
              {r?.image ? (
                <ImageWithFallback
                  src={thumbnailURL(r.image)}
                  alt=""
                  width={r.image.dims[0]}
                  height={r.image.dims[1]}
                  wrapperClassName="h-full w-full"
                  className={cn('h-full w-full object-cover object-top', blur && 'blur-md')}
                />
              ) : null}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

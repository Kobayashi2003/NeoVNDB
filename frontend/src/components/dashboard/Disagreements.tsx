/** Where the reader's rating parts furthest from vndb's, either way. Each
 *  title is a track from 10 to 100 with both ratings on it, the reader's stars
 *  read on vndb's scale (one star 20, five 100), so the gap is the distance;
 *  a faint tick marks each star. */

import Link from 'next/link';
import { disagreements, type Detail, type Entry } from '@/lib/dashboard';
import { display, score } from '@/lib/format';
import { Block, Plot } from './Block';

const N = 4;
/** Where each of the reader's ratings lands on the track. */
const STARS = [1, 2, 3, 4, 5];

export function Disagreements({
  scope,
  details,
  original,
}: {
  scope: Entry[];
  details: Map<string, Detail>;
  original: boolean;
}) {
  const { above, below } = disagreements(
    scope
      .filter(e => e.rating !== null)
      .map(e => ({ id: e.id, mine: e.rating!, theirs: details.get(e.id)?.rating ?? null })),
    N,
  );
  if (above.length === 0 && below.length === 0) return null;
  const name = (id: string) => {
    const d = details.get(id);
    return d ? display(d.title, d.alttitle, original) || id : id;
  };
  const group = (heading: string, items: typeof above) =>
    items.length > 0 && (
      <div className="min-w-0">
        <h3 className="mb-2 text-xs text-muted">{heading}</h3>
        <ul className="flex flex-col gap-2.5">
          {items.map(d => {
            const you = d.mine * 20;
            const [lo, hi] = you < d.theirs ? [you, d.theirs] : [d.theirs, you];
            const at = (v: number) => `${((v - 10) / 90) * 100}%`;
            return (
              <li key={d.id} className="flex flex-col gap-1 text-xs">
                <div className="flex items-baseline justify-between gap-3">
                  <Link
                    href={`/${d.id}`}
                    className="min-w-0 truncate transition-colors hover:text-accent"
                  >
                    {name(d.id)}
                  </Link>
                  <span className="shrink-0 tabular-nums text-muted">
                    <span className="text-accent">★{d.mine}</span> against {score(d.theirs)}
                  </span>
                </div>
                <div
                  className="h-2 rounded-full bg-white/5 px-1.5"
                  role="img"
                  aria-label={`You gave ${d.mine} stars, vndb ${score(d.theirs)}`}
                >
                  {/* Inset by a dot's radius, so a dot at either end stays on the track. */}
                  <div className="relative h-full">
                    {STARS.map(s => (
                      <span
                        key={s}
                        className="absolute inset-y-0.5 w-px bg-white/10"
                        style={{ left: at(s * 20) }}
                      />
                    ))}
                    <span
                      className="absolute inset-y-0 rounded-full bg-accent/25"
                      style={{ left: at(lo), width: `calc(${at(hi)} - ${at(lo)})` }}
                    />
                    <span
                      className="absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white/60 bg-surface"
                      style={{ left: at(d.theirs) }}
                    />
                    <span
                      className="absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent"
                      style={{ left: at(you) }}
                    />
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    );

  return (
    <Block title="Where you part from vndb">
      <Plot className="flex flex-col gap-4">
        <p className="flex items-center gap-4 text-[0.625rem] text-muted" aria-hidden>
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-accent" />
            You
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-full border-2 border-white/60" />
            vndb
          </span>
        </p>
        <div className="grid gap-x-8 gap-y-5 sm:grid-cols-2">
          {group('You rate higher', above)}
          {group('You rate lower', below)}
        </div>
      </Plot>
    </Block>
  );
}

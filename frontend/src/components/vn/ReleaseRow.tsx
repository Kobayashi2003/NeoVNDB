/** One release as stacked blocks (metadata, title, icons) that fall into one
 *  line from `sm` up; a table cannot fit a phone. Machine-translated and
 *  unofficial releases are dimmed so they stand out when scanning. */
'use client';

import Link from 'next/link';
import { cn } from '@/lib/utils';
import { iconOf } from '@/lib/icons';
import { enumLabel } from '@/lib/enums';
import { AgeRating } from '@/components/ui/AgeRating';
import { Icon } from '@/components/ui/Icon';
import { Tooltip } from '@/components/ui/Tooltip';
import { animationLabel, aspect, display, medium, releaseDate } from '@/lib/format';
import { usePrefs } from '@/hooks/usePrefs';
import type { Release } from '@/lib/types';
import { Name } from '@/components/ui/Name';

/** A medium is something physical or a download, drawn as a disc, a cartridge
 *  or a download arrow. */
function mediumIcon(code: string): string {
  if (code === 'in') return 'icon-rel-download';
  if (code === 'cart') return 'icon-rel-cartridge';
  return 'icon-rel-disk';
}

export function ReleaseRow({ release: r, striped }: { release: Release; striped: boolean }) {
  const { original } = usePrefs();
  const ratio = aspect(r.resolution);
  const mtl = r.titles.some(t => t.mtl);

  // Story animation stands in for the release as a whole, which is what vndb
  // shows; the ero slot only appears when there is ero to animate.
  const story = animationLabel(r.animation?.story?.sprites ?? r.animation?.story?.cg ?? null);
  const ero = r.has_ero
    ? animationLabel(r.animation?.ero?.sprites ?? r.animation?.ero?.cg ?? null)
    : null;

  return (
    <div
      className={cn(
        'flex flex-col gap-1 border-b border-white/5 px-3 py-2 text-xs transition-colors last:border-0 hover:bg-white/[0.03]',
        'sm:grid sm:grid-cols-[auto_auto_auto_1fr_auto] sm:items-baseline sm:gap-x-3 sm:gap-y-0',
        striped && 'bg-black/20',
        (mtl || !r.official) && 'opacity-60',
      )}
    >
      {/* One line of metadata on a phone; three separate cells from sm up. */}
      <div className="flex items-center gap-3 sm:contents">
        <span className="whitespace-nowrap tabular-nums text-muted">{releaseDate(r.released)}</span>

        <span className="flex items-center gap-1 whitespace-nowrap">
          <Tooltip label={r.has_ero ? 'Contains erotic scenes' : 'No erotic scenes'}>
            <span className={r.has_ero ? 'text-rose-400' : 'text-white/25'} aria-hidden>
              &hearts;
            </span>
          </Tooltip>
          <AgeRating minage={r.minage} uncensored={r.uncensored} />
        </span>

        <span className="inline-flex shrink-0 items-center gap-1">
          {r.platforms.map(p => (
            <Icon key={p} cls={iconOf('PLATFORM', p)} title={enumLabel('PLATFORM', p)} />
          ))}
          <Icon cls={`icon-rt${r.rtype}`} title={enumLabel('RTYPE', r.rtype)} />
        </span>
      </div>

      <div className="min-w-0">
        <Link
          href={`/${r.id}`}
          className="text-white/90 transition-colors hover:text-accent coarse:py-1"
        >
          {display(r.title, r.alttitle, original) || r.id}
        </Link>
        {r.patch && <span className="ml-1 text-muted">(patch)</span>}
        {!r.official && <span className="ml-1 text-muted">(unofficial)</span>}
        {mtl && <span className="ml-1 text-muted">(machine translation)</span>}
        {r.producers.length > 0 && (
          <p className="mt-0.5 truncate text-muted">
            {r.producers.map((p, i) => (
              <span key={p.id}>
                {i > 0 && ' · '}
                <Name name={p.name} original={p.original} />
                {p.developer && !p.publisher && ' (dev)'}
                {p.publisher && !p.developer && ' (pub)'}
              </span>
            ))}
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-1 sm:flex-nowrap sm:justify-end">
        {r.notes && <Icon cls="icon-rel-notes" title={r.notes} />}
        {r.media.map(m => (
          <Icon key={m.medium} cls={mediumIcon(m.medium)} title={medium(m)} />
        ))}
        {ratio && <Icon cls={`icon-rel-reso-${ratio}`} title={r.resolution!} />}
        <Icon
          cls={r.freeware ? 'icon-rel-free' : 'icon-rel-nonfree'}
          title={r.freeware ? 'Freeware' : 'Non-free'}
        />
        {story && <Icon cls="icon-rel-ani-story" title={`Story scene animation: ${story}`} />}
        {ero && <Icon cls="icon-rel-ani-ero" title={`Erotic scene animation: ${ero}`} />}
        {r.voiced ? (
          <Icon
            cls={`icon-rel-voiced icon-rel-v${r.voiced}`}
            title={enumLabel('VOICED', r.voiced)}
          />
        ) : null}
        {r.drm.map(d => (
          <Icon key={d.id} cls="icon-rel-notes" title={`DRM: ${d.name}`} />
        ))}
      </div>
    </div>
  );
}

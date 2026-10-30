/** The titles behind the numbers, as a column of rows beside the charts: a
 *  pick in a chart changes it at once, in sight. Latest first and grouped by
 *  month, or ordered by either rating. */
'use client';

import { Fragment, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { thumbnailURL } from '@/lib/images';
import { shouldBlur } from '@/lib/content';
import { display, score } from '@/lib/format';
import type { Detail, Entry } from '@/lib/dashboard';
import { usePrefs } from '@/hooks/usePrefs';
import { ImageWithFallback } from '@/components/ui/ImageWithFallback';
import { ChoiceMenu } from '@/components/ui/ChoiceMenu';
import { Section } from '@/components/ui/Section';
import { Placeholder, surface } from '@/components/ui/Surface';

/** Rows drawn at first, and how many more each time the end comes into view. */
const PAGE = 40;

type Order = 'latest' | 'mine' | 'theirs';

/** Every row this tall, so one still being fetched holds its place. */
const ROW = 'flex h-14 items-center gap-2.5 px-3';

export function TitleList({
  scope,
  details,
  came,
  className,
}: {
  scope: Entry[];
  details: Map<string, Detail>;
  came: string;
  className?: string;
}) {
  const [order, setOrder] = useState<Order>('latest');
  const [limit, setLimit] = useState(PAGE);
  const sorted =
    order === 'latest'
      ? scope
      : [...scope].sort((a, b) =>
          order === 'mine'
            ? (b.rating ?? 0) - (a.rating ?? 0)
            : (details.get(b.id)?.rating ?? 0) - (details.get(a.id)?.rating ?? 0),
        );
  const shown = sorted.slice(0, limit);
  const more = sorted.length > limit;
  const box = useRef<HTMLDivElement>(null);
  const end = useRef<HTMLDivElement>(null);

  // The next rows are drawn as the last comes near, within the list's own
  // scrolling; a fresh observer per page, so one already in view loads again.
  useEffect(() => {
    if (!more || !end.current) return;
    const seen = new IntersectionObserver(([e]) => e.isIntersecting && setLimit(l => l + PAGE), {
      root: box.current,
      rootMargin: '0px 0px 400px 0px',
    });
    seen.observe(end.current);
    return () => seen.disconnect();
  }, [more, limit]);

  return (
    <aside
      className={cn(
        'flex min-h-0 flex-col [&>section]:flex [&>section]:min-h-0 [&>section]:flex-1 [&>section]:flex-col',
        className,
      )}
    >
      <Section
        title="Titles"
        count={scope.length}
        action={
          <ChoiceMenu
            label="Sort titles"
            prefix="Sort:"
            value={order}
            onChange={setOrder}
            align="end"
            choices={[
              { value: 'latest', label: `Latest ${came.toLowerCase()}` },
              { value: 'mine', label: 'Your rating' },
              { value: 'theirs', label: 'vndb rating' },
            ]}
          />
        }
      >
        {/* Relative, so the covers' positioned layers are clipped by this box;
            without it they hung below it and stretched the page by every
            page of rows loaded. */}
        <div
          ref={box}
          className={surface('relative min-h-0 flex-1 overflow-y-auto overscroll-contain')}
        >
          {shown.length === 0 ? (
            <p className="px-3 py-6 text-center text-xs text-muted">No titles match.</p>
          ) : (
            <ol key={order} className="animate-swap-in">
              {shown.map((e, i) => {
                const month = e.at.slice(0, 7);
                const heads =
                  order === 'latest' && (i === 0 || shown[i - 1].at.slice(0, 7) !== month);
                return (
                  <Fragment key={e.id}>
                    {heads && (
                      <li
                        className="sticky top-0 z-10 border-b border-white/5 bg-surface-solid px-3 py-1 text-[0.625rem] font-semibold tabular-nums text-muted"
                        aria-hidden
                      >
                        {month}
                      </li>
                    )}
                    <li className="border-b border-white/5 last:border-0">
                      <TitleRow entry={e} detail={details.get(e.id)} came={came} />
                    </li>
                  </Fragment>
                );
              })}
            </ol>
          )}
          {more && (
            <div ref={end} className={cn(ROW, 'border-t border-white/5')}>
              <Placeholder className="aspect-[2/3] w-8 shrink-0 rounded" />
              <Placeholder className="h-3 w-2/3 rounded" />
            </div>
          )}
        </div>
      </Section>
    </aside>
  );
}

function TitleRow({ entry, detail, came }: { entry: Entry; detail?: Detail; came: string }) {
  const { original, sexual, violence } = usePrefs();
  if (!detail) {
    return (
      <div className={ROW}>
        <Placeholder className="aspect-[2/3] w-8 shrink-0 rounded" />
        <Placeholder className="h-3 w-2/3 rounded" />
      </div>
    );
  }
  const name = display(detail.title, detail.alttitle, original) || detail.id;
  const image = detail.image;
  const blur = !!image && shouldBlur(image.sexual, image.violence, sexual, violence);
  return (
    <Link
      href={`/${detail.id}`}
      className={cn(
        ROW,
        'group outline-none transition-colors hover:bg-white/[0.04] focus-visible:bg-white/[0.07]',
      )}
    >
      <span className="aspect-[2/3] w-8 shrink-0 overflow-hidden rounded bg-elevated">
        {image && (
          <ImageWithFallback
            src={thumbnailURL(image)}
            alt=""
            width={image.dims[0]}
            height={image.dims[1]}
            wrapperClassName="h-full w-full"
            className={cn('h-full w-full object-cover object-top', blur && 'blur-sm')}
          />
        )}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-xs font-medium transition-colors group-hover:text-accent">
          {name}
        </span>
        <span className="flex items-center gap-2 text-[0.6875rem] tabular-nums text-muted">
          {entry.rating !== null && <span className="text-accent">★{entry.rating}</span>}
          {detail.rating !== null && <span>{score(detail.rating)}</span>}
          <span className="ml-auto">
            <span className="sr-only">{came} </span>
            {entry.at.slice(0, 10)}
          </span>
        </span>
      </span>
    </Link>
  );
}

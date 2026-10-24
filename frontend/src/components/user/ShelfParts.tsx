/** The pieces of a shelf page around its results (ShelfPanel.tsx). */
'use client';

import Link from 'next/link';
import { Star, X } from 'lucide-react';
import { withParams, type Params } from '@/lib/href';
import { cn } from '@/lib/utils';
import { ControlLabel } from '@/components/ui/ControlLabel';
import { SearchPill } from '@/components/ui/SearchPill';
import { useNavigate } from '@/hooks/useNavigate';

/** The reader's rating, on the card it is of. */
export function Rated({
  rating,
  grid,
  children,
}: {
  rating: number;
  grid: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={cn('relative', grid ? 'h-full' : 'pl-9')}>
      {children}
      <span
        title={`Your rating: ${rating}`}
        className={cn(
          'pointer-events-none absolute flex items-center gap-0.5 rounded-full bg-black/70 px-1.5 py-0.5 text-[0.6875rem] font-semibold tabular-nums text-amber-300',
          grid ? 'right-2 top-2' : 'left-1.5 top-1/2 -translate-y-1/2',
        )}
      >
        <Star className="h-3 w-3 fill-current" aria-hidden />
        {rating}
      </span>
    </div>
  );
}

/** Saved items a vndb order cannot place, and the way to where they show. */
export function Missing({
  count,
  noun,
  order,
  href,
}: {
  count: number;
  noun: string;
  order: string;
  href: string;
}) {
  const [entries, are, them] =
    count === 1 ? ['One entry', 'is', 'it'] : [`${count.toLocaleString()} entries`, 'are', 'them'];
  return (
    <p className="text-xs text-muted">
      {entries} in {noun} {are} no longer on vndb, so this order leaves {them} out.{' '}
      <Link href={href} className="text-accent hover:underline">
        See {them} by {order.toLowerCase()}
      </Link>
      .
    </p>
  );
}

/** Navigates on submit, not per keystroke. */
export function SearchInList({
  path,
  params,
  initial,
  noun,
}: {
  path: string;
  params: Params;
  initial: string;
  noun: string;
}) {
  const navigate = useNavigate();
  return (
    <SearchPill
      name="q"
      initial={initial}
      label={`Search ${noun}`}
      onSearch={term => navigate.push(withParams(path, params, { q: term || null, page: null }))}
      before={<ControlLabel className="mr-0">In {noun.split(' ').pop()}</ControlLabel>}
      after={
        initial && (
          <Link
            href={withParams(path, params, { q: null, page: null })}
            aria-label="Clear the search"
            className="shrink-0 text-muted transition-colors hover:text-white"
          >
            <X className="h-3.5 w-3.5" aria-hidden />
          </Link>
        )
      }
    />
  );
}

/** The frame of a list's page: the column of lists beside the open one. It
 *  belongs to the layout, so it stays put -- and keeps its scroll -- while
 *  the list beside it changes. */
'use client';

import { usePathname } from 'next/navigation';
import { ListChecks } from 'lucide-react';
import { useSession } from '@/hooks/useSession';
import { useCollections } from '@/hooks/useCollections';
import { SignInFirst } from './SignInFirst';
import { CollectionColumn } from './CollectionSwitcher';

/** From lg up each column scrolls on its own (as DetailShell). Stable
 *  scrollbar gutters avoid width jumps; padding cancelled by negative margin
 *  keeps focus rings from being clipped. */
const ROW = 'flex w-full gap-6 lg:h-full';
const COLUMN =
  'shelf-lists -mx-1 hidden w-56 shrink-0 overflow-y-auto overscroll-contain px-1 py-6 [scrollbar-gutter:stable] lg:flex';
const BODY =
  'flex min-w-0 flex-1 flex-col gap-4 lg:-ml-1 lg:overflow-y-auto lg:overscroll-contain lg:pb-12 lg:pl-1 lg:pr-3 lg:pt-6 lg:[scrollbar-gutter:stable]';

export function Shelf({ children }: { children: React.ReactNode }) {
  const session = useSession();
  const path = usePathname();
  const { lists } = useCollections(session.status === 'in');
  const current = Number(path.split('/')[2]);

  if (session.status === 'out') {
    return (
      <div className={ROW}>
        <div className={BODY}>
          <SignInFirst next={path} icon={ListChecks} title="This list is kept on an account">
            Sign in to open it.
          </SignInFirst>
        </div>
      </div>
    );
  }

  return (
    <div className={ROW}>
      {lists ? (
        <CollectionColumn lists={lists} current={current} className={COLUMN} />
      ) : (
        // Holds the column's place until the lists arrive.
        <div className="hidden w-[13.5rem] shrink-0 lg:block" aria-hidden />
      )}
      <div data-scroll-top className={BODY}>
        {session.status === 'in' ? (
          children
        ) : (
          <div className="h-64 w-full animate-pulse rounded-lg bg-white/5" aria-hidden />
        )}
      </div>
    </div>
  );
}

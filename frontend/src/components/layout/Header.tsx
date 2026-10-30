/** The site header: seven type shelves and the statistics, the current one
 *  marked (detail pages included). Below 896px they collapse into a menu.
 *
 *  896 is measured: the worst case (a max-length username, view button and
 *  search control) still fits with Stats added. Re-measure before adding
 *  anything. It stays one row at every width, which `--header-h` relies on. */
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Search } from 'lucide-react';
import { LIST, TYPES } from '@/lib/list';
import { iconButton, pill } from '@/components/ui/Pill';
import { SHORT, STATS } from './shelves';
import { BrowseMenu } from './BrowseMenu';
import { SearchField } from './SearchField';
import { ViewMenu } from './ViewMenu';
import { UserMenu } from '@/components/user/UserMenu';

/** `name` is who was signed in last time, for the account control's size
 *  until the session answers (see NAME_COOKIE). */
export function Header({ name }: { name: string | null }) {
  const pathname = usePathname();
  const here = /^\/([vrcpsgi])\d*$/.exec(pathname)?.[1];
  const onStats = pathname === STATS.href;

  return (
    <header className="site-header sticky top-0 z-40 h-(--header-h) shrink-0 border-b border-white/10 bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-full max-w-page items-center gap-3 px-4">
        <Link
          href="/"
          className="shrink-0 font-display text-lg tracking-tight transition-opacity hover:opacity-80"
        >
          NeoVNDB
        </Link>

        <BrowseMenu here={onStats ? 'stats' : here} className="min-[896px]:hidden" />

        <nav
          aria-label="Browse"
          className="hidden min-w-0 flex-1 items-center gap-1 min-[896px]:flex"
        >
          {TYPES.map(type => (
            <Link
              key={type}
              href={`/${type}`}
              aria-current={type === here ? 'page' : undefined}
              title={LIST[type].label}
              className={pill({ tone: type === here ? 'on' : 'quiet', className: 'shrink-0' })}
            >
              {SHORT[type]}
            </Link>
          ))}
          <Link
            href={STATS.href}
            aria-current={onStats ? 'page' : undefined}
            title={STATS.full}
            className={pill({ tone: onStats ? 'on' : 'quiet', className: 'shrink-0' })}
          >
            {STATS.label}
          </Link>
        </nav>

        {/* The box where there is room for one, an icon where there is room
            only for that, and on the narrowest screens neither: below sm the
            browse menu carries it, because 40px is the difference between the
            bar fitting and not at 320 with a name at its full cap. */}
        {/* 9rem at lg: wider, the shelves' row is clipped at 1024 (measured,
            with Stats and a name at its cap). */}
        <SearchField className="hidden lg:flex lg:w-36 xl:w-64" />
        <Link
          href="/q"
          aria-label="Search everything"
          title="Search everything"
          className={iconButton('hidden sm:flex lg:hidden')}
        >
          <Search className="size-4" aria-hidden />
        </Link>

        <ViewMenu />
        <UserMenu name={name} />
      </div>
    </header>
  );
}

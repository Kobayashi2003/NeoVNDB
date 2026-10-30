/** The seven shelves and the statistics as one menu, below the width where
 *  they fit in a row (a sideways-scrolling strip hid the last ones). The
 *  button names the current one. */
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ChartColumn, Library, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { LIST, TYPES } from '@/lib/list';
import { MenuDivider, MenuPanel, menuItem } from '@/components/ui/Menu';
import { Chevron, pill } from '@/components/ui/Pill';
import { SHORT, STATS } from './shelves';
import { useMenu } from '@/hooks/useMenu';

export function BrowseMenu({ here, className }: { here?: string; className?: string }) {
  const [open, setOpen] = useState(false);
  // Hung from the left of a button that starts after the logo, so on the
  // narrowest screens its right edge lands past the window.
  const { box, panel: menu } = useMenu(open, setOpen);

  return (
    // A container: the room left beside the logo decides whether the shelf's
    // name fits. Where it does not (a phone with a long name signed in) the
    // button is its icon alone, rather than the name cut to "B.".
    <div ref={box} className={cn('@container relative min-w-0 flex-1', className)}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        aria-label="Browse"
        className={pill({
          tone: here ? 'on' : 'quiet',
          className: 'max-w-full',
        })}
      >
        <Library className="icon-text h-3.5 w-3.5 shrink-0" aria-hidden />
        <span className="hidden truncate @min-[6.5rem]:inline">
          {here === 'stats' ? STATS.label : here ? SHORT[here] : 'Browse'}
        </span>
        <Chevron open={open} />
      </button>

      {open && (
        <MenuPanel ref={menu}>
          {/* Below sm this is the only way to the search page: the bar has no
              room for even an icon there. */}
          <Link href="/q" onClick={() => setOpen(false)} className={cn(menuItem(), 'sm:hidden')}>
            <Search className="icon-text size-3.5 shrink-0 text-muted" aria-hidden />
            Search everything
          </Link>
          <div className="sm:hidden">
            <MenuDivider />
          </div>

          {TYPES.map(type => {
            const on = type === here;
            return (
              <Link
                key={type}
                href={`/${type}`}
                onClick={() => setOpen(false)}
                aria-current={on ? 'page' : undefined}
                className={menuItem({ current: on })}
              >
                <span className="truncate">{LIST[type].label}</span>
              </Link>
            );
          })}
          <MenuDivider />
          <Link
            href={STATS.href}
            onClick={() => setOpen(false)}
            aria-current={here === 'stats' ? 'page' : undefined}
            className={menuItem({ current: here === 'stats' })}
          >
            <ChartColumn className="icon-text size-3.5 shrink-0 text-muted" aria-hidden />
            {STATS.full}
          </Link>
        </MenuPanel>
      )}
    </div>
  );
}

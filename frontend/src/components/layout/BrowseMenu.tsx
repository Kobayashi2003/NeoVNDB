/** The seven shelves as one menu, below the width where they fit in a row
 *  (a sideways-scrolling strip hid the last ones). The button names the
 *  current shelf. */
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ChevronDown, Library, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { LIST, TYPES } from '@/lib/list';
import { MenuDivider, MenuPanel, menuItem } from '@/components/ui/Menu';
import { SHORT } from './shelves';
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
        className={cn(
          'flex max-w-full items-center gap-1 rounded-full px-3 py-1 text-xs font-medium transition-colors',
          here ? 'bg-white/15 text-white' : 'text-muted hover:bg-white/10 hover:text-white',
        )}
      >
        <Library className="icon-text h-3.5 w-3.5 shrink-0" aria-hidden />
        <span className="hidden truncate @min-[6.5rem]:inline">
          {here ? SHORT[here] : 'Browse'}
        </span>
        <ChevronDown
          className={cn('icon-text h-3 w-3 shrink-0 transition-transform', open && 'rotate-180')}
          aria-hidden
        />
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
        </MenuPanel>
      )}
    </div>
  );
}

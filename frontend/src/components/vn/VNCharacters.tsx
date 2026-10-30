/** The characters section: a grid of who is in this. Each tile opens the
 *  character; the full list, with every detail, is a click on the heading.
 *  Spoilers are coloured, and what is still hidden is counted in a line of
 *  pills. */
'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { enumLabel } from '@/lib/enums';
import { ROLE_ORDER, spoilerExtent } from '@/lib/characters';
import { useSpoilerLevel } from '@/hooks/useSpoilerLevel';
import { usePrefs } from '@/hooks/usePrefs';
import { TabBar, type Tab } from '@/components/ui/TabBar';
import { SpoilerReveals } from '@/components/ui/SpoilerReveals';
import { VNCharacterTile } from './VNCharacterTile';
import type { Character } from '@/lib/types';

const ALL = 'all';

export function VNCharacters({ characters }: { characters: Character[] }) {
  const { explicit } = usePrefs();
  const [role, setRole] = useState(ALL);

  const extent = spoilerExtent(characters, explicit);
  const spoiler = useSpoilerLevel(extent.minor, extent.major);

  // Role counts ignore the spoiler level: a tab that changed its number as
  // spoilers opened would itself leak how many are hidden behind each role.
  const tabs: Tab[] = [
    { value: ALL, label: 'All', count: characters.length },
    ...ROLE_ORDER.map(r => ({
      value: r,
      label: enumLabel('CHARACTER_ROLE', r),
      count: characters.filter(c => c.role === r).length,
    })).filter(t => t.count > 0),
  ];

  const inRole = role === ALL ? characters : characters.filter(c => c.role === role);
  const shown = inRole.filter(c => c.spoiler <= spoiler.level);
  const hiddenMinor = inRole.filter(c => c.spoiler === 1 && spoiler.level < 1).length;
  const hiddenMajor = inRole.filter(c => c.spoiler === 2 && spoiler.level < 2).length;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <TabBar tabs={tabs} active={role} onChange={setRole} />
        {spoiler.any && (
          <button
            onClick={spoiler.cycle}
            className={cn('shrink-0 py-1 text-xs transition-colors', spoiler.className)}
          >
            {spoiler.label}
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 items-stretch gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-3 xl:grid-cols-4">
        {shown.map(c => (
          <VNCharacterTile key={c.id} character={c} spoilerLevel={spoiler.level} />
        ))}
      </div>

      {/* A line of pills, as for hidden tags: a card the size of a portrait
          for "+2" was the biggest thing in the section. */}
      {(hiddenMinor > 0 || hiddenMajor > 0) && (
        <div className="flex flex-wrap gap-1.5">
          <SpoilerReveals
            minor={hiddenMinor}
            major={hiddenMajor}
            noun="character"
            className="py-1"
            onReveal={spoiler.set}
          />
        </div>
      )}
    </div>
  );
}

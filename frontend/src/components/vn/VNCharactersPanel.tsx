/** Expanded characters view: dense cards grouped by role, filling the main
 *  column. Opened from a slide card, it scrolls to that character. */
'use client';

import { useEffect, useRef } from 'react';
import { ChevronLeft } from 'lucide-react';
import { cn } from '@/lib/utils';
import { enumLabel } from '@/lib/enums';
import { byRole, spoilerExtent } from '@/lib/characters';
import { useSpoilerLevel } from '@/hooks/useSpoilerLevel';
import { SpoilerScope } from '@/components/ui/Spoiler';
import { VNCharacterCard } from './VNCharacterCard';
import { usePrefs } from '@/hooks/usePrefs';
import type { Character } from '@/lib/types';

export function VNCharactersPanel({
  characters,
  focusId,
  onClose,
}: {
  characters: Character[];
  /** Scroll this character's card into view on open. */
  focusId: string | null;
  onClose: () => void;
}) {
  const { explicit } = usePrefs();
  const extent = spoilerExtent(characters, explicit);
  const spoiler = useSpoilerLevel(extent.minor, extent.major);

  const shown = characters.filter(c => c.spoiler <= spoiler.level);
  const held = characters.length - shown.length;
  const groups = byRole(shown);

  // scrollIntoView walks every scrollable ancestor, which resets the main
  // column at lg+ and the window when stacked -- landing at the top of the
  // section either way.
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (focusId) document.getElementById(`char-${focusId}`)?.scrollIntoView({ block: 'start' });
    else root.current?.scrollIntoView({ block: 'start' });
  }, [focusId]);

  return (
    <SpoilerScope level={spoiler.level}>
      <div ref={root} className="flex scroll-mt-4 flex-col gap-6">
        <div className="flex items-center justify-between gap-3">
          <button
            onClick={onClose}
            className="flex items-center gap-1.5 text-sm font-bold uppercase tracking-wider transition-colors hover:text-accent"
          >
            <ChevronLeft className="h-5 w-5" aria-hidden />
            Characters
            <span className="text-xs font-normal normal-case tracking-normal text-muted">
              {characters.length}
            </span>
          </button>
          {spoiler.any && (
            <button
              onClick={spoiler.cycle}
              className={cn('shrink-0 text-xs transition-colors coarse:py-1', spoiler.className)}
            >
              {spoiler.label}
            </button>
          )}
        </div>

        {groups.map(([role, list]) => (
          <div key={role} className="flex flex-col gap-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted">
              {enumLabel('CHARACTER_ROLE', role)}
              <span className="ml-2 text-muted/60">{list.length}</span>
            </p>
            {list.map(c => (
              <div key={c.id} id={`char-${c.id}`} className="scroll-mt-4">
                <VNCharacterCard character={c} spoilerLevel={spoiler.level} />
              </div>
            ))}
          </div>
        ))}

        {held > 0 && (
          <button
            onClick={spoiler.cycle}
            className={cn('self-start text-xs transition-colors', spoiler.className)}
          >
            +{held} hidden spoiler character{held === 1 ? '' : 's'} &mdash; click to reveal
          </button>
        )}
      </div>
    </SpoilerScope>
  );
}

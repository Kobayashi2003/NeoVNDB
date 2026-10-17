/** One character card at a time, height-capped; the fade at the cut opens
 *  the expanded view. */
'use client';

import { useCallback, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { VNCharacterCard } from './VNCharacterCard';
import type { Character } from '@/lib/types';
import type { SpoilerLevel } from '@/hooks/useSpoilerLevel';

const ARROW =
  'flex h-9 w-9 items-center justify-center rounded-full text-muted transition-colors hover:bg-white/5 hover:text-white disabled:cursor-not-allowed disabled:opacity-25 disabled:hover:bg-transparent';

export function VNCharacterSlider({
  characters,
  spoilerLevel,
  onExpand,
}: {
  /** Already filtered by role and spoiler level. */
  characters: Character[];
  spoilerLevel: SpoilerLevel;
  onExpand?: (id: string) => void;
}) {
  const [index, setIndex] = useState(0);
  const total = characters.length;

  // Reset to the first card when the filtered list changes, during render so
  // the index is never stale. Compared by ids: the parent rebuilds the array
  // every render, so identity changes on unrelated preference toggles.
  const signature = characters.map(c => c.id).join();
  const [tracked, setTracked] = useState(signature);
  if (tracked !== signature) {
    setTracked(signature);
    setIndex(0);
  }

  const step = useCallback(
    (by: number) => setIndex(at => Math.min(Math.max(at + by, 0), Math.max(total - 1, 0))),
    [total],
  );

  if (total === 0) return null;

  const at = Math.min(index, total - 1);
  const current = characters[at];

  return (
    // ← and → step while the focus is anywhere in it (its own arrows, a link
    // on the card), and are then this slider's rather than the page's.
    <div
      className="flex flex-col gap-3"
      onKeyDown={e => {
        if (e.altKey || e.ctrlKey || e.metaKey) return;
        if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
        e.preventDefault();
        step(e.key === 'ArrowRight' ? 1 : -1);
      }}
    >
      <VNCharacterCard
        key={current.id}
        character={current}
        spoilerLevel={spoilerLevel}
        clamp
        onExpand={onExpand && (() => onExpand(current.id))}
      />

      <div className="flex items-center justify-center gap-3">
        <button
          onClick={() => step(-1)}
          disabled={at <= 0}
          aria-label="Previous character"
          className={ARROW}
        >
          <ChevronLeft className="h-5 w-5" aria-hidden />
        </button>
        <span className="select-none text-xs tabular-nums text-muted">
          {at + 1} / {total}
        </span>
        <button
          onClick={() => step(1)}
          disabled={at >= total - 1}
          aria-label="Next character"
          className={ARROW}
        >
          <ChevronRight className="h-5 w-5" aria-hidden />
        </button>
      </div>
    </div>
  );
}

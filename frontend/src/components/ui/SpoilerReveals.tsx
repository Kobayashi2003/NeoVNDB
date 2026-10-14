/** Buttons revealing what a spoiler level hides, placed where the hidden
 *  items would be (yellow minor, orange major). No wrapper: the caller owns
 *  the layout. */
'use client';

import { cn } from '@/lib/utils';
import type { SpoilerLevel } from '@/hooks/useSpoilerLevel';

export function SpoilerReveals({
  minor,
  major,
  noun,
  className,
  onReveal,
}: {
  minor: number;
  major: number;
  /** What is hidden, e.g. "trait". Omitted, it reads "+3 minor spoilers". */
  noun?: string;
  className?: string;
  onReveal: (level: SpoilerLevel) => void;
}) {
  const label = (count: number, tone: string) =>
    noun
      ? `+${count} ${tone} spoiler ${count === 1 ? noun : `${noun}s`}`
      : `+${count} ${tone} spoiler${count === 1 ? '' : 's'}`;

  return (
    <>
      {minor > 0 && (
        <button
          type="button"
          onClick={() => onReveal(1)}
          className={cn(
            'inline-flex items-center rounded-full border border-yellow-500/20 bg-yellow-500/10 px-2.5 py-0.5 text-xs text-yellow-400 coarse:py-1 transition-colors hover:bg-yellow-500/20',
            className,
          )}
        >
          {label(minor, 'minor')}
        </button>
      )}
      {major > 0 && (
        <button
          type="button"
          onClick={() => onReveal(2)}
          className={cn(
            'inline-flex items-center rounded-full border border-orange-500/20 bg-orange-500/10 px-2.5 py-0.5 text-xs text-orange-400 coarse:py-1 transition-colors hover:bg-orange-500/20',
            className,
          )}
        >
          {label(major, 'major')}
        </button>
      )}
    </>
  );
}

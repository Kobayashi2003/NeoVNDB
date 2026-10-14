/** Content levels, starting spoiler level and names, adjustable from any
 *  page. The dot on the button shows when a content level is above its
 *  gentlest setting. */
'use client';

import { useState } from 'react';
import { Eye, EyeOff, Flame, Languages, Swords } from 'lucide-react';
import { cn } from '@/lib/utils';
import { usePrefs } from '@/hooks/usePrefs';
import { useMenu } from '@/hooks/useMenu';
import { Segmented, type Option } from '@/components/ui/Segmented';
import type { SexualLevel, SpoilerLevel, ViolenceLevel } from '@/lib/content';
import { MenuDivider, MenuLabel, MenuMark, MenuPanel, menuItem } from '@/components/ui/Menu';

/** The two scales. Their colours climb with them, so a raised one is
 *  recognisable without reading the word. */
const SEXUAL: Option<SexualLevel>[] = [
  { value: 'safe', label: 'Safe' },
  {
    value: 'suggestive',
    label: 'Suggestive',
    short: 'Sugg',
    activeClass: 'bg-yellow-500/80 text-black',
  },
  { value: 'explicit', label: 'Explicit', short: 'Expl', activeClass: 'bg-red-500/80 text-white' },
];

const VIOLENCE: Option<ViolenceLevel>[] = [
  { value: 'tame', label: 'Tame' },
  { value: 'violent', label: 'Violent', short: 'Viol', activeClass: 'bg-orange-500/80 text-black' },
  { value: 'brutal', label: 'Brutal', short: 'Brut', activeClass: 'bg-red-800/80 text-white' },
];

/** Written as strings because that is what a row of options is keyed by; the
 *  level itself is a number, and the two are one step apart. */
const SPOILERS: Option<string>[] = [
  { value: '0', label: 'None' },
  { value: '1', label: 'Minor', activeClass: 'bg-yellow-500/80 text-black' },
  { value: '2', label: 'All', activeClass: 'bg-orange-500/80 text-black' },
];

export function ViewMenu() {
  const p = usePrefs();
  const [open, setOpen] = useState(false);
  // Hung from the right of a button that, on a phone, is not far from the left.
  const { box, panel: menu } = useMenu(open, setOpen);
  const raised = p.sexual !== 'safe' || p.violence !== 'tame';

  return (
    <div ref={box} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        aria-label={raised ? 'What to show (more than the safest is on)' : 'What to show'}
        title="What to show"
        className={cn(
          'relative flex size-7 items-center justify-center rounded-full transition-colors',
          open ? 'bg-white/15 text-white' : 'text-muted hover:bg-white/10 hover:text-white',
        )}
      >
        <Eye className="size-4" aria-hidden />
        {raised && (
          <span
            className={cn(
              'absolute right-0.5 top-0.5 size-2 rounded-full ring-2 ring-background',
              p.sexual === 'explicit' || p.violence === 'brutal' ? 'bg-red-500' : 'bg-yellow-500',
            )}
            aria-hidden
          />
        )}
      </button>

      {open && (
        // Fixed width: the scales are controls, not rows, and read best at the
        // same size every time.
        <MenuPanel ref={menu} align="end" className="w-72 p-1.5">
          <MenuLabel icon={<Flame className="size-3.5" aria-hidden />}>Sexual content</MenuLabel>
          <div className="px-1 pb-2">
            <Segmented
              label="Sexual content"
              value={p.sexual}
              options={SEXUAL}
              onChange={sexual => p.set({ sexual })}
              className="w-full"
            />
          </div>
          <MenuLabel icon={<Swords className="size-3.5" aria-hidden />}>Violent content</MenuLabel>
          <div className="px-1 pb-1">
            <Segmented
              label="Violent content"
              value={p.violence}
              options={VIOLENCE}
              onChange={violence => p.set({ violence })}
              className="w-full"
            />
          </div>
          <MenuLabel icon={<EyeOff className="size-3.5" aria-hidden />}>Spoilers</MenuLabel>
          <div className="px-1 pb-1">
            <Segmented
              label="Spoilers"
              value={String(p.spoiler)}
              options={SPOILERS}
              onChange={level => p.set({ spoiler: Number(level) as SpoilerLevel })}
              className="w-full"
            />
          </div>
          <MenuDivider />
          <MenuLabel icon={<Languages className="size-3.5" aria-hidden />}>Names</MenuLabel>
          <button
            type="button"
            onClick={() => p.set({ original: !p.original })}
            aria-pressed={p.original}
            className={menuItem({ className: p.original ? 'text-white' : undefined })}
          >
            <MenuMark kind="check" on={p.original} />
            <span className="min-w-0 flex-1">
              Original script
              <span className="block text-[0.6875rem] text-muted">
                Names as first written; Japanese for tags and traits
              </span>
            </span>
          </button>
        </MenuPanel>
      )}
    </div>
  );
}

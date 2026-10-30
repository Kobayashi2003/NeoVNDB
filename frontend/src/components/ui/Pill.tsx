/** The rounded control the site's menus open from, as a class helper since it
 *  may be a button or a link, and the chevron that says it opens. */

import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Every control that sits in a row with others is this tall: pills, segmented
 *  switches, tabs, icon buttons, a toolbar's search field. Rows of controls
 *  mixed 20 to 34 px before; one height lines any two of them up. */
export const CONTROL_H = 'h-7';

/** `filled` stands on its own; `on` is open, or holding a choice; `quiet` sits
 *  in a row of others and fills only on hover. */
export function pill({
  tone = 'filled',
  className,
}: {
  tone?: 'filled' | 'on' | 'quiet';
  className?: string;
} = {}) {
  return cn(
    'inline-flex items-center gap-1 rounded-full px-3 text-xs font-medium transition-colors',
    CONTROL_H,
    tone === 'filled' && 'bg-white/10 text-white hover:bg-white/15',
    tone === 'on' && 'bg-white/20 text-white hover:bg-white/25',
    tone === 'quiet' && 'text-muted hover:bg-white/10 hover:text-white',
    className,
  );
}

/** A round button holding only an icon, as tall as the other controls. */
export function iconButton(className?: string) {
  return cn(
    'flex shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:bg-white/10 hover:text-white',
    CONTROL_H,
    'w-7',
    className,
  );
}

/** Points down while closed, up while open. */
export function Chevron({ open, className }: { open: boolean; className?: string }) {
  return (
    <ChevronDown
      className={cn(
        'icon-text size-3 shrink-0 transition-transform',
        open && 'rotate-180',
        className,
      )}
      aria-hidden
    />
  );
}

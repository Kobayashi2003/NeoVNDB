/** The rounded control the site's menus open from, as a class helper since it
 *  may be a button or a link, and the chevron that says it opens. */

import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

/** `filled` stands on its own; `on` is open, or holding a choice; `quiet` sits
 *  in a row of others and fills only on hover. */
export function pill({
  tone = 'filled',
  size = 'md',
  className,
}: {
  tone?: 'filled' | 'on' | 'quiet';
  /** `sm` for a pill after a ControlLabel or in a dense row. */
  size?: 'sm' | 'md';
  className?: string;
} = {}) {
  return cn(
    'inline-flex items-center gap-1 rounded-full text-xs font-medium transition-colors',
    size === 'sm' ? 'px-3 py-1' : 'px-3 py-1.5',
    tone === 'filled' && 'bg-white/10 text-white hover:bg-white/15',
    tone === 'on' && 'bg-white/20 text-white hover:bg-white/25',
    tone === 'quiet' && 'text-muted hover:bg-white/10 hover:text-white',
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

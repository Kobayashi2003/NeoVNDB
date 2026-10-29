/** The site's two surfaces, as class helpers since the element varies (a
 *  section, a form, a dl, a link), and the placeholder that stands in for a
 *  surface still loading. */

import { cn } from '@/lib/utils';

/** The card everything sits on: sidebar panels, charts, forms, row lists. */
export function surface(className?: string) {
  return cn('rounded-lg border border-white/5 bg-surface', className);
}

/** A panel floating over content, translucent so what passes under it shows
 *  it is above the page rather than part of it. */
export function floating(className?: string) {
  return cn(
    'rounded-xl border border-white/10 bg-surface/90 shadow-lg shadow-black/30 backdrop-blur-md',
    className,
  );
}

/** The pulsing block held where a surface will be; size it to what replaces
 *  it, so nothing moves when that arrives. */
export function Placeholder({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-lg bg-white/5', className)} aria-hidden />;
}

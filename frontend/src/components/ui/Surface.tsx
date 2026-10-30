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

/** The pulsing block held where something will be; size it to what replaces
 *  it, so nothing moves when that arrives. Draw the parts that need no data
 *  (frames, titles, table heads) for real and hold only the rest with these,
 *  shaped like it: a line of text, a cover, a chart. */
export function Placeholder({
  className,
  style,
}: {
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div className={cn('skeleton rounded-lg bg-white/5', className)} style={style} aria-hidden />
  );
}

/** Lines of text still to come, the last one short as a paragraph's is. */
export function PlaceholderLines({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div className={cn('flex flex-col gap-2 py-0.5', className)} aria-hidden>
      {Array.from({ length: lines }, (_, i) => (
        <Placeholder
          key={i}
          className={cn('h-3 rounded', i === lines - 1 && lines > 1 ? 'w-2/5' : 'w-full')}
        />
      ))}
    </div>
  );
}

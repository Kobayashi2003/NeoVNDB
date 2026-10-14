/** The label before a row of controls ("Sort", "Filter"). Uppercase and
 *  spaced so it is never mistaken for one of the options. */

import { cn } from '@/lib/utils';

export function ControlLabel({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'mr-1 shrink-0 text-[0.625rem] font-semibold uppercase tracking-wider text-muted/70',
        className,
      )}
    >
      {children}
    </span>
  );
}

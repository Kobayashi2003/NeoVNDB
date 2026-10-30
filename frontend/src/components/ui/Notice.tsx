/** What a page or a part of one shows in place of what it would hold: signed
 *  out, not found, failed, nothing yet. One card, centred in the room it is
 *  given, so every such state reads the same wherever it turns up. */
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export function Notice({
  icon: Icon,
  title,
  tone = 'plain',
  actions,
  className,
  page = false,
  children,
}: {
  icon: LucideIcon;
  title: string;
  /** It is the whole page, so its title is the page's h1. */
  page?: boolean;
  /** `trouble` when something failed rather than is simply absent. */
  tone?: 'plain' | 'trouble';
  /** Links or buttons made with `noticeAction`. */
  actions?: React.ReactNode;
  /** Sizes the room it centres in; a page-sized one by default. */
  className?: string;
  children?: React.ReactNode;
}) {
  const Heading = page ? 'h1' : 'h2';
  return (
    <div className={cn('flex w-full items-center justify-center py-8 sm:min-h-[50dvh]', className)}>
      <div
        role={tone === 'trouble' ? 'alert' : undefined}
        className="flex w-full max-w-sm flex-col items-center rounded-xl border border-white/5 bg-surface px-6 py-10 text-center"
      >
        <span
          className={cn(
            'flex size-12 items-center justify-center rounded-full ring-1',
            tone === 'trouble'
              ? 'bg-red-500/10 text-red-400 ring-red-500/20'
              : 'bg-accent/10 text-accent ring-accent/20',
          )}
        >
          <Icon className="size-5" aria-hidden />
        </span>
        <Heading className="mt-4 text-base font-semibold">{title}</Heading>
        {children && <div className="mt-1.5 text-sm text-muted">{children}</div>}
        {actions && (
          <div className="mt-6 flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:justify-center">
            {actions}
          </div>
        )}
      </div>
    </div>
  );
}

/** A notice's way on: the one to take first is `primary`. */
export function noticeAction(primary = false) {
  return cn(
    'rounded-full px-5 py-2 text-center text-sm font-semibold transition-colors',
    primary ? 'bg-accent text-background hover:bg-accent-hover' : 'bg-white/10 hover:bg-white/20',
  );
}

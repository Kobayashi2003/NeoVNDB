/** Choosing several results at once: the checkbox drawn over each card, and
 *  the bar pinned to the foot of the window while choosing. The actions in the
 *  bar are the caller's (a collection moves and removes; results save). */
'use client';

import { Check, CheckSquare, Square, X } from 'lucide-react';
import { cn } from '@/lib/utils';

/** A card with a checkbox; clicks select rather than navigate. Tiles put
 *  the box over the picture, rows indent to make room for it. */
export function Selectable({
  on,
  grid,
  onToggle,
  children,
}: {
  on: boolean;
  grid: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        'relative rounded-lg transition-shadow',
        !grid && 'pl-9',
        on && 'ring-2 ring-accent ring-offset-2 ring-offset-background',
      )}
    >
      <div className="pointer-events-none">{children}</div>
      <button
        type="button"
        onClick={onToggle}
        aria-pressed={on}
        className="absolute inset-0 cursor-pointer rounded-lg"
      >
        <span
          className={cn(
            'absolute flex h-5 w-5 items-center justify-center rounded border transition-colors',
            grid ? 'left-2 top-2' : 'left-2 top-1/2 -translate-y-1/2',
            on ? 'border-accent bg-accent' : 'border-white/40 bg-background/70',
          )}
        >
          {on && <Check className="h-3.5 w-3.5 text-background" strokeWidth={4} aria-hidden />}
        </span>
        <span className="sr-only">{on ? 'Deselect' : 'Select'}</span>
      </button>
    </div>
  );
}

/** The bar: select-this-page, the count, the caller's actions, and Done. */
export function ActionBar({
  error,
  note,
  chosen,
  allOnPage,
  canSelectPage,
  onAll,
  onClose,
  children,
}: {
  error: string | null;
  /** A quiet line above the controls, such as what the last action did. */
  note?: string | null;
  chosen: number;
  allOnPage: boolean;
  canSelectPage: boolean;
  onAll: () => void;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-40 flex justify-center px-3">
      <div className="pointer-events-auto flex max-w-full flex-col gap-1 rounded-2xl border border-white/15 bg-[var(--overlay)] p-1.5 shadow-2xl shadow-black/60 animate-slide-up-fade">
        {error ? (
          <p role="alert" className="px-2 pt-1 text-xs text-red-400">
            {error}
          </p>
        ) : (
          note && (
            <p role="status" className="px-2 pt-1 text-xs text-muted">
              {note}
            </p>
          )
        )}

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onAll}
            disabled={!canSelectPage}
            title={allOnPage ? 'Deselect this page' : 'Select this page'}
            aria-label={allOnPage ? 'Deselect this page' : 'Select this page'}
            className="rounded-full p-2 transition-colors hover:bg-white/10 disabled:opacity-40"
          >
            {allOnPage ? (
              <CheckSquare className="h-4 w-4 text-accent" aria-hidden />
            ) : (
              <Square className="h-4 w-4" aria-hidden />
            )}
          </button>

          <span className="min-w-14 select-none px-1 text-center text-xs font-medium tabular-nums sm:min-w-20">
            {chosen} selected
          </span>

          <span className="mx-0.5 h-6 w-px bg-white/15" aria-hidden />

          {children}

          <span className="mx-0.5 h-6 w-px bg-white/15" aria-hidden />

          <button
            type="button"
            onClick={onClose}
            aria-label="Done selecting"
            title="Done selecting"
            className="rounded-full p-2 text-muted transition-colors hover:bg-white/10 hover:text-white"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
      </div>
    </div>
  );
}

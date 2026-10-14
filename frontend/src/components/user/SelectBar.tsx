/** A collection's bulk actions -- move and remove -- in the shared ActionBar. */
'use client';

import { useState } from 'react';
import { Check, FolderInput, Loader2, Trash2, X } from 'lucide-react';
import { MenuLabel, MenuPanel, menuItem } from '@/components/ui/Menu';
import type { Collection } from '@/lib/user';
import { ActionBar } from '@/components/ui/Selection';
import { useMenu } from '@/hooks/useMenu';

export function SelectBar({
  chosen,
  pageSize,
  allOnPage,
  lists,
  busy,
  error,
  onAll,
  onMove,
  onRemove,
  onClose,
}: {
  chosen: number;
  pageSize: number;
  allOnPage: boolean;
  /** Where a move could go: the reader's other lists of this same kind. */
  lists: Collection[];
  busy: boolean;
  error: string | null;
  onAll: () => void;
  onMove: (to: number) => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  const [picking, setPicking] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const { box, panel: menu } = useMenu(picking, setPicking);

  return (
    <ActionBar
      error={error}
      chosen={chosen}
      allOnPage={allOnPage}
      canSelectPage={pageSize > 0 && !busy}
      onAll={onAll}
      onClose={onClose}
    >
      <div ref={box} className="relative">
        <button
          type="button"
          onClick={() => setPicking(o => !o)}
          disabled={chosen === 0 || busy || lists.length === 0}
          aria-expanded={picking}
          title={lists.length === 0 ? 'No other list of this kind' : 'Move to another list'}
          className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs transition-colors hover:bg-white/10 disabled:opacity-40"
        >
          <FolderInput className="icon-text h-4 w-4 shrink-0" aria-hidden />
          <span className="hidden sm:inline">Move</span>
        </button>

        {picking && (
          // Upward: the bar sits at the foot of the screen.
          <MenuPanel ref={menu} above scroll>
            <MenuLabel>Move to</MenuLabel>
            {lists.map(list => (
              <button
                key={list.id}
                type="button"
                onClick={() => {
                  setPicking(false);
                  onMove(list.id);
                }}
                className={menuItem()}
              >
                <span className="min-w-0 flex-1 truncate">{list.name}</span>
                <span className="shrink-0 tabular-nums text-muted">{list.count}</span>
              </button>
            ))}
          </MenuPanel>
        )}
      </div>

      {confirming ? (
        // Asked in place, like deleting a list is. What goes is only a
        // mark, but it is still a thing the reader chose to keep.
        <>
          <span className="px-1 text-xs text-muted">Remove?</span>
          <button
            type="button"
            onClick={() => {
              setConfirming(false);
              onRemove();
            }}
            disabled={busy}
            aria-label="Yes, remove them"
            className="rounded-full p-2 text-red-400 transition-colors hover:bg-red-500/15 disabled:opacity-40"
          >
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <Check className="h-4 w-4" aria-hidden />
            )}
          </button>
          <button
            type="button"
            onClick={() => setConfirming(false)}
            aria-label="Keep them"
            className="rounded-full p-2 text-muted transition-colors hover:bg-white/10 hover:text-white"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </>
      ) : (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          disabled={chosen === 0 || busy}
          title="Remove from this list"
          className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs text-red-400 transition-colors hover:bg-red-500/15 disabled:opacity-40"
        >
          <Trash2 className="icon-text h-4 w-4 shrink-0" aria-hidden />
          <span className="hidden sm:inline">Remove</span>
        </button>
      )}
    </ActionBar>
  );
}

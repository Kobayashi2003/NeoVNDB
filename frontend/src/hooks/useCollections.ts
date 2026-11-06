/** The reader's lists, held once for every page that shows them, so moving
 *  between lists redraws the list and not the column beside it. Read again
 *  whenever a page that shows them mounts, and after anything that changes a
 *  name or a count; the last answer stays on screen meanwhile. */
'use client';

import { useEffect, useSyncExternalStore } from 'react';
import { collections, errorText, type Collection } from '@/lib/user';

export interface Lists {
  lists: Collection[] | null;
  error: string | null;
}

const NONE: Lists = { lists: null, error: null };
let current: Lists = NONE;
let asking: Promise<void> | null = null;
/** Bumped by forgetting: an answer asked for before it is someone else's. */
let era = 0;
const listeners = new Set<() => void>();

function set(next: Lists) {
  current = next;
  for (const notify of listeners) notify();
}

/** Ask again; a call while one is out waits for that one. */
export function refreshCollections(): Promise<void> {
  if (asking) return asking;
  const asked = era;
  const mine: Promise<void> = collections()
    .then(
      lists => {
        if (era === asked) set({ lists, error: null });
      },
      err => {
        if (era === asked) set({ lists: current.lists, error: errorText(err) });
      },
    )
    .finally(() => {
      if (asking === mine) asking = null;
    });
  asking = mine;
  return mine;
}

/** Forget them, as when the reader signs out. An answer still on its way is
 *  dropped when it comes: set, it put the last reader's lists back. */
export function forgetCollections() {
  era++;
  asking = null;
  set(NONE);
}

export function useCollections(enabled: boolean): Lists {
  const held = useSyncExternalStore(
    notify => {
      listeners.add(notify);
      return () => void listeners.delete(notify);
    },
    () => current,
    () => NONE,
  );
  useEffect(() => {
    if (enabled) void refreshCollections();
  }, [enabled]);
  return held;
}

/** Site-wide reading preferences in a module-level store shared across
 *  components and tabs. The context only carries what the server rendered with
 *  (from the cookie), so hydration matches. See lib/prefs.ts. */
'use client';

import { createContext, useContext, useSyncExternalStore } from 'react';
import { DEFAULTS, PREFS_COOKIE, PREFS_STORAGE, readPrefs, type Prefs } from '@/lib/prefs';

export type { CharacterLayout, Prefs } from '@/lib/prefs';

export interface PrefsControl extends Prefs {
  set: (change: Partial<Prefs>) => void;
  /** Also ungates sexual tags and traits. */
  explicit: boolean;
}

const listeners = new Set<() => void>();

/** Must stay referentially stable between changes for useSyncExternalStore. */
let current: Prefs | null = null;

function cookie(): string | null {
  const found = document.cookie.split('; ').find(pair => pair.startsWith(PREFS_COOKIE + '='));
  return found ? decodeURIComponent(found.slice(PREFS_COOKIE.length + 1)) : null;
}

function writeCookie(prefs: Prefs): void {
  const value = encodeURIComponent(JSON.stringify(prefs));
  document.cookie = `${PREFS_COOKIE}=${value}; path=/; max-age=31536000; samesite=lax`;
}

function load(): Prefs {
  return readPrefs(cookie());
}

function snapshot(): Prefs {
  if (current === null) current = load();
  return current;
}

// Cookies fire no event, so localStorage is still written as the cross-tab signal.
function onStorage(e: StorageEvent): void {
  if (e.key !== PREFS_STORAGE) return;
  current = load();
  for (const notify of listeners) notify();
}

function subscribe(notify: () => void): () => void {
  if (listeners.size === 0) window.addEventListener('storage', onStorage);
  listeners.add(notify);
  return () => {
    listeners.delete(notify);
    if (listeners.size === 0) window.removeEventListener('storage', onStorage);
  };
}

function apply(next: Prefs): void {
  current = next;
  writeCookie(current);
  try {
    window.localStorage.setItem(PREFS_STORAGE, JSON.stringify(current));
  } catch {
    // Only the cross-tab signal; the cookie already holds the value.
  }
  for (const notify of listeners) notify();
}

/** Set while a reader is signed in (hooks/accountPrefs.ts): every change the
 *  reader makes here is then also kept on their account. */
let keep: ((prefs: Prefs) => void) | null = null;

export function keepPrefsWith(save: ((prefs: Prefs) => void) | null): void {
  keep = save;
}

function update(change: Partial<Prefs>): void {
  apply({ ...snapshot(), ...change });
  keep?.(snapshot());
}

/** The account's preferences, taken over without being sent back. */
export function adoptPrefs(prefs: Prefs): void {
  const now = snapshot();
  if ((Object.keys(prefs) as (keyof Prefs)[]).every(k => prefs[k] === now[k])) return;
  apply(prefs);
}

export function currentPrefs(): Prefs {
  return snapshot();
}

/** Supplied by the root layout, the only reader of the cookie. */
const Rendered = createContext<Prefs>(DEFAULTS);

export function PrefsRendered({ value, children }: { value: Prefs; children: React.ReactNode }) {
  return <Rendered value={value}>{children}</Rendered>;
}

export function usePrefs(): PrefsControl {
  const rendered = useContext(Rendered);
  // The server snapshot is used on the server and during hydration.
  const prefs = useSyncExternalStore(subscribe, snapshot, () => rendered);
  return { ...prefs, set: update, explicit: prefs.sexual === 'explicit' };
}

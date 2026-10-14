/** Closes a popover on a pointer down outside the ref'd element or on
 *  Escape. Put the ref on the wrapper holding both the button and the panel,
 *  so clicking the button to close is not also an outside click. */
'use client';

import { useEffect, useRef } from 'react';

export function useDismiss<T extends HTMLElement>(open: boolean, close: () => void) {
  const inside = useRef<T>(null);
  // Kept in a ref so the listeners are bound once per opening rather than once
  // per render: callers pass a fresh closure every time.
  const latest = useRef(close);

  useEffect(() => {
    latest.current = close;
  });

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      if (!inside.current?.contains(e.target as Node)) latest.current();
    };
    const escape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') latest.current();
    };
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('mousedown', away);
      document.removeEventListener('keydown', escape);
    };
  }, [open]);

  return inside;
}

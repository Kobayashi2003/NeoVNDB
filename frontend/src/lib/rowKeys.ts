/** Arrow keys, Home and End along a row of choices -- tabs, a segmented
 *  control -- the way a reader of such rows expects (WAI-ARIA tabs and radio
 *  groups). `choose` moves the choice with the focus, as tab buttons and radios
 *  do; links only move the focus, and Enter follows the one it is on. */
import type { KeyboardEvent } from 'react';

const ITEMS = 'button:not([disabled]), a[href]';

export function rowKeys({ choose = false }: { choose?: boolean } = {}) {
  return (e: KeyboardEvent<HTMLElement>) => {
    const keys = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'];
    if (!keys.includes(e.key) || e.altKey || e.ctrlKey || e.metaKey) return;
    const items = [...e.currentTarget.querySelectorAll<HTMLElement>(ITEMS)];
    const at = items.indexOf(document.activeElement as HTMLElement);
    if (at === -1) return;
    const next =
      e.key === 'Home'
        ? 0
        : e.key === 'End'
          ? items.length - 1
          : (at + (e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : -1) + items.length) %
            items.length;
    // Handled: the page's own arrow-key shortcuts (paging) leave it alone.
    e.preventDefault();
    items[next].focus();
    if (choose) items[next].click();
  };
}

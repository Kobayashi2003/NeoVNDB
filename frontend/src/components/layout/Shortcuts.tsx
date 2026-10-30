/** Keys for the things done most: searching, paging, moving between sections.
 *  `?` lists them. None of them fires while typing, while a dialog (the image
 *  viewer) is open, or when a control under the focus has already used the key
 *  -- tabs and sideways rows take the arrows for themselves.
 *
 *  Each acts by finding the control on the page that does the same thing and
 *  using it, so a key does exactly what its click does, and a page without that
 *  control has no such key. */
'use client';

import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { useNavigate } from '@/hooks/useNavigate';

/** Fired to open the list from elsewhere (the view menu). */
export const SHOW_SHORTCUTS = 'neovndb:shortcuts';

const KEYS: [string[], string][] = [
  [['/'], 'Search: this list, or everything'],
  [['←', '→'], 'Previous and next page of a list'],
  [['j', 'k'], 'Next and previous section of a page'],
  [['←', '→'], 'Previous and next image, in the image viewer (or the wheel)'],
  [['Esc'], 'Close a menu, a dialog or a selection'],
  [['?'], 'This list'],
];

function typing(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement
  );
}

/** The first of these that is on screen. */
function visible<T extends HTMLElement>(selector: string): T | null {
  for (const el of document.querySelectorAll<T>(selector)) {
    if (el.offsetParent !== null) return el;
  }
  return null;
}

export function Shortcuts() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const show = () => setOpen(true);
    window.addEventListener(SHOW_SHORTCUTS, show);
    return () => window.removeEventListener(SHOW_SHORTCUTS, show);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || typing(e.target)) return;
      if (open) {
        if (e.key === 'Escape' || e.key === '?') setOpen(false);
        return;
      }
      if (document.querySelector('[aria-modal="true"]')) return;

      const act = (run: () => void) => {
        e.preventDefault();
        run();
      };
      switch (e.key) {
        case '?':
          return act(() => setOpen(true));
        case '/': {
          // The page's own search first (a list's), then the site's.
          const box =
            visible<HTMLInputElement>('main input[type="search"]') ??
            visible<HTMLInputElement>('header input[type="search"]');
          return act(() => (box ? box.focus() : navigate.push('/q')));
        }
        case 'ArrowLeft':
        case 'ArrowRight': {
          const label = e.key === 'ArrowLeft' ? 'Previous' : 'Next';
          const step = visible<HTMLAnchorElement>(
            `nav[aria-label="Pages"] a[aria-label="${label}"]`,
          );
          if (step) act(() => step.click());
          return;
        }
        case 'j':
        case 'k': {
          const links = [...document.querySelectorAll<HTMLAnchorElement>('[data-section-nav] a')];
          if (links.length === 0 || !visible('[data-section-nav]')) return;
          const at = links.findIndex(a => a.hasAttribute('aria-current'));
          const next = Math.min(Math.max(at + (e.key === 'j' ? 1 : -1), 0), links.length - 1);
          return act(() => links[next].click());
        }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, navigate]);

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-slide-up-fade"
      onClick={() => setOpen(false)}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Keyboard shortcuts"
        className="w-full max-w-sm rounded-xl border border-white/10 bg-[var(--overlay)] p-4 shadow-2xl shadow-black/60"
        onClick={e => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold">Keyboard shortcuts</h2>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close"
            className="rounded-full p-1 text-muted transition-colors hover:bg-white/10 hover:text-white"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
        <dl className="grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-2 text-xs">
          {KEYS.map(([keys, what]) => (
            <div key={what} className="contents">
              <dt className="flex gap-1">
                {keys.map(k => (
                  <kbd
                    key={k}
                    className="min-w-6 rounded border border-white/15 bg-white/5 px-1.5 py-0.5 text-center font-mono text-[0.6875rem] text-white"
                  >
                    {k}
                  </kbd>
                ))}
              </dt>
              <dd className="text-muted">{what}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}

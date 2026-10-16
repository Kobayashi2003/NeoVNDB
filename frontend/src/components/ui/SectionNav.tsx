/** The sections of a detail page as a row of pills that stays at the top of
 *  the column while it scrolls: where you are on a long page, and a click to
 *  go anywhere else on it. In place it is a row like a catalogue page's tabs;
 *  once it sticks it floats on a card, as the relation graph's controls do, so
 *  the text passing under it stays out of its way. The row scrolls sideways
 *  when it outgrows a phone. Fewer than three sections need no map. */
'use client';

import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

interface Mark {
  id: string;
  title: string;
  count: string | null;
}

/** How far below the row a section's top may sit and still count as the one
 *  being read: the heading has just come into view under it. */
const READING_SLACK = 48;

export function SectionNav() {
  const spot = useRef<HTMLDivElement>(null);
  const nav = useRef<HTMLElement>(null);
  const [marks, setMarks] = useState<Mark[]>([]);
  const [current, setCurrent] = useState<string | null>(null);
  const [stuck, setStuck] = useState(false);

  useEffect(() => {
    // The column the sections are in: its own scroll box from lg up, the
    // window below that. Both are listened to; only one ever moves.
    // Found from the spot, which is there before the first sections are.
    const box = spot.current?.closest<HTMLElement>('[data-scroll-top]');
    if (!box) return;

    const sections = () => [...box.querySelectorAll<HTMLElement>('section[data-section]')];
    const atEnd = () => {
      const own = box.scrollHeight > box.clientHeight;
      return own
        ? box.scrollTop + box.clientHeight >= box.scrollHeight - 2
        : window.scrollY > 0 &&
            window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 2;
    };
    const read = () => {
      const row = nav.current?.getBoundingClientRect();
      // The spot it was laid out at has scrolled away from under it.
      setStuck(!!row && (spot.current?.getBoundingClientRect().top ?? 0) < row.top - 1);
      const line = (row?.bottom ?? 0) + READING_SLACK;
      const all = sections();
      let lit = all[0]?.id ?? null;
      for (const s of all) if (s.getBoundingClientRect().top <= line) lit = s.id;
      // Scrolled to the very end, the last section may be too short to reach
      // the line.
      if (atEnd()) lit = all.at(-1)?.id ?? lit;
      setCurrent(lit);
    };
    // Sections come and go: the characters view replaces them, a spoiler
    // level adds one, a count changes.
    const collect = () => {
      const found = sections().map(s => ({
        id: s.id,
        title: s.dataset.section ?? '',
        count: s.dataset.count ?? null,
      }));
      setMarks(now =>
        now.length === found.length &&
        now.every((m, i) => m.id === found[i].id && m.count === found[i].count)
          ? now
          : found,
      );
      read();
    };

    collect();
    const changes = new MutationObserver(collect);
    changes.observe(box, { childList: true, subtree: true });
    box.addEventListener('scroll', read, { passive: true });
    window.addEventListener('scroll', read, { passive: true });
    return () => {
      changes.disconnect();
      box.removeEventListener('scroll', read);
      window.removeEventListener('scroll', read);
    };
  }, []);

  // The lit pill kept in view in a row that scrolls sideways. By the row's own
  // scrollLeft: scrollIntoView would also move the page, cutting short the
  // smooth scroll a click on the row has just started.
  useEffect(() => {
    const row = nav.current?.querySelector('ul');
    const lit = row?.querySelector<HTMLElement>('[aria-current]');
    if (!row || !lit) return;
    const left = lit.offsetLeft - row.offsetLeft;
    if (left < row.scrollLeft) row.scrollLeft = left;
    else if (left + lit.offsetWidth > row.scrollLeft + row.clientWidth)
      row.scrollLeft = left + lit.offsetWidth - row.clientWidth;
  }, [current]);

  if (marks.length < 3) return <div ref={spot} hidden />;

  return (
    <>
      <div ref={spot} aria-hidden />
      <nav
        ref={nav}
        aria-label="Sections"
        // Pulled left by the card's padding and border, so in place the first
        // pill lines up with the headings below.
        className="sticky top-[calc(var(--header-h)+0.5rem)] z-20 -ml-[5px] mb-5 w-fit max-w-[calc(100%+5px)] lg:top-2"
      >
        <ul
          className={cn(
            'flex gap-1 overflow-x-auto rounded-full border p-1 transition-[background-color,border-color,box-shadow] duration-200 [scrollbar-width:none]',
            stuck
              ? 'border-white/10 bg-surface/90 shadow-lg shadow-black/30 backdrop-blur-md'
              : 'border-transparent',
          )}
        >
          {marks.map(m => (
            <li key={m.id} className="shrink-0">
              <a
                href={`#${m.id}`}
                aria-current={m.id === current ? 'location' : undefined}
                onClick={e => {
                  e.preventDefault();
                  document.getElementById(m.id)?.scrollIntoView({ behavior: 'smooth' });
                  setCurrent(m.id);
                }}
                className={cn(
                  'block rounded-full px-3 py-1 text-xs font-medium transition-colors',
                  m.id === current
                    ? 'bg-white/20 text-white'
                    : 'text-muted hover:bg-white/10 hover:text-white',
                )}
              >
                {m.title}
                {m.count && <span className="ml-1.5 tabular-nums text-muted">{m.count}</span>}
              </a>
            </li>
          ))}
        </ul>
      </nav>
    </>
  );
}

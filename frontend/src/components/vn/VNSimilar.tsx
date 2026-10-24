/** Works alike in their tags, as one sideways row of covers: twenty of them
 *  would otherwise be the longest thing on the page, and covers are looked
 *  through by eye rather than read down. The arrows page by what is on
 *  screen; a wheel (rolled up and down, as most are), a trackpad or a swipe
 *  scroll it as well. */
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Results } from '@/components/results/Results';
import { Section } from '@/components/ui/Section';
import { useSidewaysWheel } from '@/hooks/useSidewaysWheel';
import type { VNRow } from '@/lib/types';

/** Results' own container, the element that scrolls. */
const stripIn = (box: HTMLDivElement | null) =>
  box?.firstElementChild as HTMLElement | null | undefined;

const ARROW =
  'flex h-7 w-7 items-center justify-center rounded-full text-muted transition-colors hover:bg-white/10 hover:text-white disabled:pointer-events-none disabled:opacity-25';

export function VNSimilar({ rows }: { rows: VNRow[] }) {
  const box = useRef<HTMLDivElement>(null);
  const [ends, setEnds] = useState({ start: true, end: false });
  useSidewaysWheel(box, ':scope > *');

  const measure = useCallback(() => {
    const s = stripIn(box.current);
    if (!s) return;
    setEnds({ start: s.scrollLeft <= 1, end: s.scrollLeft + s.clientWidth >= s.scrollWidth - 1 });
  }, []);

  useEffect(() => {
    const s = stripIn(box.current);
    if (!s) return;
    measure();
    s.addEventListener('scroll', measure, { passive: true });
    const resized = new ResizeObserver(measure);
    resized.observe(s);
    return () => {
      s.removeEventListener('scroll', measure);
      resized.disconnect();
    };
  }, [measure]);

  const page = (direction: 1 | -1) => {
    const s = stripIn(box.current);
    // Most of a screenful, so the last cover seen stays in view as a landmark.
    if (s) s.scrollBy({ left: direction * s.clientWidth * 0.85, behavior: 'smooth' });
  };

  return (
    <Section
      title="Similar"
      count={rows.length}
      action={
        !(ends.start && ends.end) && (
          <span className="flex items-center gap-0.5">
            <button
              type="button"
              onClick={() => page(-1)}
              disabled={ends.start}
              aria-label="Earlier similar works"
              className={ARROW}
            >
              <ChevronLeft className="h-4 w-4" aria-hidden />
            </button>
            <button
              type="button"
              onClick={() => page(1)}
              disabled={ends.end}
              aria-label="More similar works"
              className={ARROW}
            >
              <ChevronRight className="h-4 w-4" aria-hidden />
            </button>
          </span>
        )
      }
    >
      <div ref={box}>
        <Results type="v" rows={rows} strip />
      </div>
    </Section>
  );
}

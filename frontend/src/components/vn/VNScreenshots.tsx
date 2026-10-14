/** Screenshots grouped by the release they came from, opening into one viewer
 *  that walks the whole set rather than the group. */
'use client';

import { useState } from 'react';
import { ImageWithFallback } from '@/components/ui/ImageWithFallback';
import { Lightbox, type LightboxImage } from '@/components/ui/Lightbox';
import { shouldBlur } from '@/lib/content';
import { display } from '@/lib/format';
import { imageURL } from '@/lib/images';
import { usePrefs } from '@/hooks/usePrefs';
import type { Release, Screenshot } from '@/lib/types';

export function VNScreenshots({
  screenshots,
  releases,
}: {
  screenshots: Screenshot[];
  releases: Release[];
}) {
  const { sexual, violence, original } = usePrefs();
  const [open, setOpen] = useState<number | null>(null);

  const titleOf = (id: string | null) => {
    const r = releases.find(r => r.id === id);
    return r ? display(r.title, r.alttitle, original) || null : null;
  };

  const images: LightboxImage[] = screenshots.map(s => ({
    url: s.url,
    blurred: shouldBlur(s.sexual, s.violence, sexual, violence),
    caption: titleOf(s.release),
  }));

  // Grouped for display, but each thumbnail keeps its index in the flat list
  // so the viewer can move between groups without knowing they exist.
  const groups: { title: string | null; items: number[] }[] = [];
  screenshots.forEach((s, i) => {
    const last = groups.at(-1);
    if (last && last.title === titleOf(s.release)) last.items.push(i);
    else groups.push({ title: titleOf(s.release), items: [i] });
  });

  return (
    <div className="flex flex-col gap-4">
      {groups.map((group, gi) => (
        <div key={gi}>
          {group.title && <p className="mb-2 truncate text-xs text-muted">{group.title}</p>}
          <div className="flex flex-wrap gap-1.5">
            {group.items.map(i => (
              <button
                key={i}
                onClick={() => setOpen(i)}
                title={group.title ?? undefined}
                /* Fixed height, natural width: shots come in both 4:3 and 16:9,
                   and a uniform tile would crop one of them. */
                className="h-16 shrink-0 overflow-hidden rounded bg-elevated transition-all hover:ring-2 hover:ring-accent sm:h-20"
              >
                <ImageWithFallback
                  /* The thumbnail, not the full image: vndb serves the same
                     shot at about a sixteenth the bytes, and nothing here is
                     ever drawn larger than that. The viewer loads the full one.
                     No width either -- upstream already sized it. */
                  src={imageURL(screenshots[i].thumbnail)}
                  alt=""
                  width={screenshots[i].dims[0]}
                  height={screenshots[i].dims[1]}
                  wrapperClassName="h-full"
                  className={`h-full w-auto transition-[filter] duration-300 ${
                    images[i].blurred ? 'scale-105 blur-md' : ''
                  }`}
                />
              </button>
            ))}
          </div>
        </div>
      ))}

      {open !== null && (
        <Lightbox images={images} index={open} onIndex={setOpen} onClose={() => setOpen(null)} />
      )}
    </div>
  );
}

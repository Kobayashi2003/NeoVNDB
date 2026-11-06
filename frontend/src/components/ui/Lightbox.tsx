/** Full-screen image viewer (arrows, Home, End, the wheel and Escape; blurred
 *  images stay blurred until clicked). Portalled to the body: `position:
 *  fixed` resolves against any ancestor with a transform or backdrop-filter,
 *  and this page has both. */
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { imageURL } from '@/lib/images';
import { ImageWithFallback } from './ImageWithFallback';

export interface LightboxImage {
  url: string;
  blurred: boolean;
  caption?: string | null;
}

export function Lightbox({
  images,
  index,
  onIndex,
  onClose,
}: {
  images: LightboxImage[];
  index: number;
  onIndex: (index: number) => void;
  onClose: () => void;
}) {
  const [revealed, setRevealed] = useState(false);
  const image = images[index];

  // A key with nowhere to go (Home on the first, an arrow with one image)
  // stays where it is, revealed as it was.
  const go = useCallback(
    (to: number) => {
      if (to === index) return;
      onIndex(to);
      setRevealed(false);
    },
    [index, onIndex],
  );
  const step = useCallback(
    (by: number) => go((index + by + images.length) % images.length),
    [go, index, images.length],
  );

  // Focus comes in with the viewer and goes back where it was: left on the
  // page, Tab walked the links behind it and a reader heard nothing open.
  const close = useRef<HTMLButtonElement>(null);
  const dialog = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const before = document.activeElement;
    close.current?.focus();
    return () => {
      if (before instanceof HTMLElement) before.focus();
    };
  }, []);

  // One image per notch of the wheel, however fast it spins: a trackpad sends
  // dozens of small events for one flick.
  const wheeled = useRef(0);
  const onWheel = (e: React.WheelEvent) => {
    if (images.length < 2 || Math.abs(e.deltaY) < 4) return;
    const now = performance.now();
    if (now - wheeled.current < 250) return;
    wheeled.current = now;
    step(e.deltaY > 0 ? 1 : -1);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Tab') {
        // Round the viewer's own buttons, never out to the page under it.
        const buttons = [...(dialog.current?.querySelectorAll('button') ?? [])];
        if (buttons.length === 0) return;
        const at = buttons.indexOf(document.activeElement as HTMLButtonElement);
        const next = (at + (e.shiftKey ? -1 : 1) + buttons.length) % buttons.length;
        e.preventDefault();
        buttons[at === -1 ? 0 : next].focus();
        return;
      }
      const to: Record<string, () => void> = {
        Escape: onClose,
        ArrowRight: () => step(1),
        ArrowLeft: () => step(-1),
        Home: () => go(0),
        End: () => go(images.length - 1),
      };
      if (!to[e.key]) return;
      // Handled here, so the page's own shortcuts (paging) leave it alone.
      e.preventDefault();
      to[e.key]();
    };
    window.addEventListener('keydown', onKey);
    // The page behind must not scroll while this is over it.
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [onClose, step, go, images.length]);

  if (!image) return null;
  const hidden = image.blurred && !revealed;

  return createPortal(
    <div
      ref={dialog}
      className="fixed inset-0 z-50 flex flex-col bg-black/90 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Screenshot viewer"
      onClick={onClose}
      onWheel={onWheel}
    >
      <div className="flex items-center justify-between px-4 py-3 text-sm text-muted">
        <span className="truncate">{image.caption}</span>
        <span className="shrink-0 tabular-nums">
          {index + 1} / {images.length}
        </span>
        <button
          ref={close}
          onClick={onClose}
          aria-label="Close"
          className="ml-4 shrink-0 rounded-full p-1 hover:bg-white/10 hover:text-white"
        >
          <X className="h-5 w-5" aria-hidden />
        </button>
      </div>

      <div className="flex min-h-0 flex-1 items-center justify-center gap-2 px-2 pb-6">
        {images.length > 1 && <Arrow side="left" onClick={() => step(-1)} />}
        {/* Stops the backdrop's close handler: clicking the image should
            reveal it, not dismiss the viewer. */}
        <div
          className="flex min-h-0 min-w-0 flex-1 justify-center"
          onClick={e => e.stopPropagation()}
        >
          <button
            onClick={() => hidden && setRevealed(true)}
            className="min-h-0 min-w-0"
            aria-label={hidden ? 'Reveal image' : undefined}
          >
            {/* No width: the viewer is the one place the original is wanted. */}
            <ImageWithFallback
              src={imageURL(image.url)}
              alt={image.caption ?? ''}
              className={`max-h-[80vh] max-w-full rounded object-contain transition-[filter] duration-300 ${
                hidden ? 'blur-2xl' : ''
              }`}
            />
          </button>
        </div>
        {images.length > 1 && <Arrow side="right" onClick={() => step(1)} />}
      </div>
    </div>,
    document.body,
  );
}

function Arrow({ side, onClick }: { side: 'left' | 'right'; onClick: () => void }) {
  const Chevron = side === 'left' ? ChevronLeft : ChevronRight;
  return (
    <button
      onClick={e => {
        e.stopPropagation();
        onClick();
      }}
      aria-label={side === 'left' ? 'Previous' : 'Next'}
      className="shrink-0 rounded-full p-2 text-muted transition-colors hover:bg-white/10 hover:text-white"
    >
      <Chevron className="h-7 w-7" aria-hidden />
    </button>
  );
}

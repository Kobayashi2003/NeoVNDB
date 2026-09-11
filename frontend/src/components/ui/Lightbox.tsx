/** Full-screen viewer over one set of images. Arrow keys and Escape work,
 *  because a viewer that only responds to clicks is a viewer you have to aim
 *  at. Blurred images stay blurred until clicked, so opening one is never a
 *  surprise.
 *
 *  It renders into the body rather than where it was declared. `position:
 *  fixed` resolves against the nearest ancestor carrying a transform, filter
 *  or backdrop-filter, and this page has all three -- the entrance animation
 *  leaves a transform behind, and every card is backdrop-blurred. Left in
 *  place the overlay sizes itself to a scrolled column instead of the screen. */
"use client"

import { useCallback, useEffect, useState } from "react"
import { createPortal } from "react-dom"
import { ChevronLeft, ChevronRight, X } from "lucide-react"
import { ImageWithFallback } from "./ImageWithFallback"

export interface LightboxImage {
  url: string
  blurred: boolean
  caption?: string | null
}

export function Lightbox({
  images,
  index,
  onIndex,
  onClose,
}: {
  images: LightboxImage[]
  index: number
  onIndex: (index: number) => void
  onClose: () => void
}) {
  const [revealed, setRevealed] = useState(false)
  const image = images[index]

  const step = useCallback(
    (by: number) => {
      onIndex((index + by + images.length) % images.length)
      setRevealed(false)
    },
    [index, images.length, onIndex],
  )

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
      else if (e.key === "ArrowRight") step(1)
      else if (e.key === "ArrowLeft") step(-1)
    }
    window.addEventListener("keydown", onKey)
    // The page behind must not scroll while this is over it.
    const previous = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      window.removeEventListener("keydown", onKey)
      document.body.style.overflow = previous
    }
  }, [onClose, step])

  if (!image) return null
  const hidden = image.blurred && !revealed

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex flex-col bg-black/90 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Screenshot viewer"
      onClick={onClose}
    >
      <div className="flex items-center justify-between px-4 py-3 text-sm text-muted">
        <span className="truncate">{image.caption}</span>
        <span className="shrink-0 tabular-nums">
          {index + 1} / {images.length}
        </span>
        <button
          onClick={onClose}
          aria-label="Close"
          className="ml-4 shrink-0 rounded-full p-1 hover:bg-white/10 hover:text-white"
        >
          <X className="h-5 w-5" aria-hidden />
        </button>
      </div>

      <div className="flex min-h-0 flex-1 items-center justify-center gap-2 px-2 pb-6">
        {images.length > 1 && (
          <Arrow side="left" onClick={() => step(-1)} />
        )}
        {/* Stops the backdrop's close handler: clicking the image should
            reveal it, not dismiss the viewer. */}
        <div className="flex min-h-0 min-w-0 flex-1 justify-center" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={() => hidden && setRevealed(true)}
            className="min-h-0 min-w-0"
            aria-label={hidden ? "Reveal image" : undefined}
          >
            <ImageWithFallback
              src={image.url}
              alt={image.caption ?? ""}
              className={`max-h-[80vh] max-w-full rounded object-contain transition-[filter] duration-300 ${
                hidden ? "blur-2xl" : ""
              }`}
            />
          </button>
        </div>
        {images.length > 1 && <Arrow side="right" onClick={() => step(1)} />}
      </div>
    </div>,
    document.body,
  )
}

function Arrow({ side, onClick }: { side: "left" | "right"; onClick: () => void }) {
  const Chevron = side === "left" ? ChevronLeft : ChevronRight
  return (
    <button
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
      aria-label={side === "left" ? "Previous" : "Next"}
      className="shrink-0 rounded-full p-2 text-muted transition-colors hover:bg-white/10 hover:text-white"
    >
      <Chevron className="h-7 w-7" aria-hidden />
    </button>
  )
}

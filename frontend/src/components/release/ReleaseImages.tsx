/** Package scans and store art, grouped by kind. Cover-kind images have no
 *  thumbnail size, so they are drawn small and loaded lazily. */
"use client"

import { useState } from "react"
import { enumLabel } from "@/lib/enums"
import { thumbnailURL } from "@/lib/images"
import { shouldBlur } from "@/lib/content"
import { ImageWithFallback } from "@/components/ui/ImageWithFallback"
import { Lightbox, type LightboxImage } from "@/components/ui/Lightbox"
import { usePrefs } from "@/hooks/usePrefs"
import type { ReleaseImage } from "@/lib/types"

/** vndb's own order: the front of the box first, then the rest of it. */
const ITYPE_ORDER = ["pkgfront", "pkgback", "pkgside", "pkgmed", "pkgcontent", "dig"]

export function ReleaseImages({ images }: { images: ReleaseImage[] }) {
  const { sexual, violence } = usePrefs()
  const [open, setOpen] = useState<number | null>(null)

  const viewable: LightboxImage[] = images.map((i) => ({
    url: i.url,
    blurred: shouldBlur(i.sexual, i.violence, sexual, violence),
    caption: enumLabel("IMAGE_TYPE", i.itype),
  }))

  // Grouped for display, but each picture keeps its index in the flat list so
  // the viewer can move between groups without knowing they exist.
  const groups = new Map<string, number[]>()
  images.forEach((img, i) => {
    groups.set(img.itype, [...(groups.get(img.itype) ?? []), i])
  })
  const known = ITYPE_ORDER.filter((t) => groups.has(t))
  const rest = [...groups.keys()].filter((t) => !ITYPE_ORDER.includes(t)).sort()

  return (
    <div className="flex flex-col gap-4">
      {[...known, ...rest].map((itype) => (
        <div key={itype}>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">
            {enumLabel("IMAGE_TYPE", itype)}
            <span className="ml-2 font-normal normal-case tracking-normal text-muted/60">
              {groups.get(itype)!.length}
            </span>
          </p>
          <div className="flex flex-wrap gap-1.5">
            {groups.get(itype)!.map((i) => (
              <button
                key={i}
                onClick={() => setOpen(i)}
                /* Fixed height, natural width: a package front and a spine are
                   nothing like the same shape, and a uniform tile would crop
                   one of them to nothing. */
                className="h-24 shrink-0 overflow-hidden rounded bg-elevated transition-all hover:ring-2 hover:ring-accent sm:h-32"
              >
                <ImageWithFallback
                  src={thumbnailURL(images[i])}
                  alt={enumLabel("IMAGE_TYPE", images[i].itype)}
                  width={images[i].dims[0]}
                  height={images[i].dims[1]}
                  wrapperClassName="h-full"
                  className={`h-full w-auto transition-[filter] duration-300 ${
                    viewable[i].blurred ? "scale-105 blur-md" : ""
                  }`}
                />
              </button>
            ))}
          </div>
        </div>
      ))}

      {open !== null && (
        <Lightbox images={viewable} index={open} onIndex={setOpen} onClose={() => setOpen(null)} />
      )}
    </div>
  )
}

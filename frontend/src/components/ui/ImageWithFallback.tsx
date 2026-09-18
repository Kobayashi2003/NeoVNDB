/** An image that says something while it loads and when it cannot load.
 *
 *  Covers and screenshots come from vndb's CDN, which is reachable from a
 *  browser and not always from wherever this is running. A broken image should
 *  read as one, and a slow image should read as one too -- an empty box is
 *  indistinguishable from a bug.
 *
 *  The placeholder needs somewhere to be, so it is drawn only when `width` and
 *  `height` are given: those reserve the image's box before a byte arrives.
 *  Without them the image is shown as it decodes, which is the better of the
 *  two behaviours when nothing can be reserved. */
"use client"

import { useEffect, useRef, useState } from "react"
import { Image as ImageIcon, ImageOff } from "lucide-react"
import { cn } from "@/lib/utils"
import { IMAGES_OFF } from "@/lib/images"

export function ImageWithFallback({
  src,
  alt,
  className,
  wrapperClassName,
  width,
  height,
}: {
  src: string
  alt: string
  className?: string
  wrapperClassName?: string
  width?: number
  height?: number
}) {
  type Status = "loading" | "ready" | "failed"
  // Kept with the src it describes, so that a new src starts over as loading
  // rather than inheriting "failed" from the last one -- which would never
  // render an <img> to find out otherwise.
  const [seen, setSeen] = useState<{ src: string; status: Status }>({ src, status: "loading" })
  const state: Status = seen.src === src ? seen.status : "loading"
  const setState = (status: Status) => setSeen({ src, status })
  const sized = width !== undefined && height !== undefined

  // An image can finish before React has attached onLoad: anything cached,
  // or served straight off disk by the edge, is often complete before the
  // page hydrates. Its load event has then already fired into nothing, and
  // without this the image stays hidden behind its placeholder for good.
  const ref = useRef<HTMLImageElement>(null)
  useEffect(() => {
    const img = ref.current
    if (img?.complete) setSeen({ src, status: img.naturalWidth > 0 ? "ready" : "failed" })
  }, [src])

  // Nothing is fetched when images are off, so this comes before anything that
  // would mount an <img>. Deliberately not the failed state: nothing is broken,
  // and a page full of error icons would read as though something were.
  if (IMAGES_OFF) {
    return (
      <span
        className={cn(
          "flex items-center justify-center bg-elevated text-muted/40",
          wrapperClassName,
          className,
        )}
        style={sized ? { aspectRatio: `${width} / ${height}` } : undefined}
        title="Images are off"
      >
        <ImageIcon className="h-5 w-5" aria-hidden />
      </span>
    )
  }

  if (state === "failed") {
    return (
      <span
        className={cn(
          "flex items-center justify-center bg-elevated text-muted",
          wrapperClassName,
          className,
        )}
        style={sized ? { aspectRatio: `${width} / ${height}` } : undefined}
        title={alt || "Image unavailable"}
      >
        <ImageOff className="h-5 w-5" aria-hidden />
      </span>
    )
  }

  const pending = sized && state === "loading"

  return (
    <span className={cn("relative block", wrapperClassName)}>
      {/* Not next/image: these are third-party URLs at every size, and the
          optimiser would pull each one through this server. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        ref={ref}
        src={src}
        alt={alt}
        width={width}
        height={height}
        loading="lazy"
        onLoad={() => setState("ready")}
        onError={() => setState("failed")}
        className={cn(className, pending && "opacity-0")}
      />
      {pending && (
        <span className="absolute inset-0 animate-pulse rounded-[inherit] bg-white/5" aria-hidden />
      )}
    </span>
  )
}

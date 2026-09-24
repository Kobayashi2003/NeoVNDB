/** An image with loading and failure states. The placeholder needs a box,
 *  so it is drawn only when width and height are given. */
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

  // A cached image can finish before hydration attaches onLoad; its load
  // event is then lost and the image would stay hidden.
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

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

import { useState } from "react"
import { ImageOff } from "lucide-react"
import { cn } from "@/lib/utils"

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
  const [state, setState] = useState<"loading" | "ready" | "failed">("loading")
  const sized = width !== undefined && height !== undefined

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

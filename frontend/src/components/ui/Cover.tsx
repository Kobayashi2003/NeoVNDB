/** An image that opens the full-size original in the lightbox. */
"use client"

import { useState } from "react"
import { cn } from "@/lib/utils"
import { imageURL, type Width } from "@/lib/images"
import { ImageWithFallback } from "./ImageWithFallback"
import { Lightbox } from "./Lightbox"
import type { Image } from "@/lib/types"

export function Cover({
  image,
  alt,
  blurred,
  className,
  imageClassName,
  width = 512,
}: {
  image: Image
  alt: string
  blurred: boolean
  /** Sizes the frame; the image fills its width. */
  className?: string
  imageClassName?: string
  /** What to load, which is not what the frame renders at: a cover on a
   *  retina screen wants more pixels than its CSS width. The viewer always
   *  gets the original whatever this says. */
  width?: Width
}) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`View ${alt || "image"} full size`}
        className={cn(
          "group relative block overflow-hidden rounded-lg bg-elevated transition-shadow hover:ring-2 hover:ring-accent",
          className,
        )}
      >
        <ImageWithFallback
          src={imageURL(image.url, width)}
          alt={alt}
          width={image.dims[0]}
          height={image.dims[1]}
          wrapperClassName="w-full"
          className={cn(
            "h-auto w-full transition-[filter,transform] duration-300 group-hover:scale-[1.02]",
            blurred && "blur-2xl",
            imageClassName,
          )}
        />
      </button>

      {open && (
        <Lightbox
          images={[{ url: image.url, blurred, caption: alt }]}
          index={0}
          onIndex={() => {}}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  )
}

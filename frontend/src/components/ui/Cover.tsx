/** An image that opens the full-size original in the lightbox. */
'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { imageURL, thumbnailURL } from '@/lib/images';
import { ImageWithFallback } from './ImageWithFallback';
import { Lightbox } from './Lightbox';
import type { Image } from '@/lib/types';

export function Cover({
  image,
  alt,
  blurred,
  className,
  imageClassName,
  thumbnail = false,
}: {
  image: Image;
  alt: string;
  blurred: boolean;
  /** Sizes the frame; the image fills its width. */
  className?: string;
  imageClassName?: string;
  /** vndb's thumbnail where the frame is small; the viewer always gets the
   *  original. */
  thumbnail?: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`View ${alt || 'image'} full size`}
        className={cn(
          'group relative block overflow-hidden rounded-lg bg-elevated transition-shadow hover:ring-2 hover:ring-accent',
          className,
        )}
      >
        <ImageWithFallback
          src={thumbnail ? thumbnailURL(image) : imageURL(image.url)}
          alt={alt}
          width={image.dims[0]}
          height={image.dims[1]}
          wrapperClassName="w-full"
          className={cn(
            'h-auto w-full transition-[filter,transform] duration-300 group-hover:scale-[1.02]',
            blurred && 'blur-2xl',
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
  );
}

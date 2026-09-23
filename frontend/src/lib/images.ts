/** The API keeps vndb's image addresses; this rewrites them to the mirror.
 *  The width goes in the path, not a query, so the edge can serve a cached
 *  file without waking imgserve. */

/** `start.ps1 -NoImages`: draw image boxes but fetch nothing. Baked in at
 *  build time (NEXT_PUBLIC_). */
export const IMAGES_OFF = process.env.NEXT_PUBLIC_NO_IMAGES === "1"

/** A path, so it resolves against whatever host served the page. */
const MIRROR = "/imgserve/img"

/** Other widths are rounded up by the mirror; these keep URLs cacheable. */
export type Width = 128 | 256 | 512

const VNDB_IMAGE = /^https?:\/\/[^/]+\/(cv|ch|sf|st)\/(\d+)\/(\d+)\.jpg$/

/** No width means the original. Non-vndb addresses pass through. */
export function imageURL(url: string, width?: Width): string {
  const match = VNDB_IMAGE.exec(url)
  if (!match) return url
  const [, kind, shard, num] = match
  return width
    ? `${MIRROR}/${width}/${kind}/${shard}/${num}.jpg`
    : `${MIRROR}/${kind}/${shard}/${num}.jpg`
}

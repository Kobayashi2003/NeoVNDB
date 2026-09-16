/** Where an image is actually loaded from.
 *
 *  The API hands out vndb's own addresses and is left that way on purpose. It
 *  describes what vndb holds; where a particular reader fetches it from is a
 *  question about this deployment, not about the data. Keeping the original
 *  address also makes "load images straight from vndb" cost nothing to
 *  support -- it is the case where this function does not run.
 *
 *  The rewrite inserts a width and swaps the host for the mirror's prefix,
 *  leaving vndb's own path untouched. That matters: the mirror stores files at
 *  exactly that path, so the edge can answer a cached image with a plain file
 *  server and the mirror process never wakes up. A query parameter could not
 *  do that -- a file matcher cannot see one. */

/** A path, not an address: these end up in `src` attributes, so the browser
 *  resolves them against whatever name the page was served under and the
 *  mirror is reachable from every one of them. The edge answers a file it
 *  already holds without waking the mirror at all. */
const MIRROR = "/imgserve/img"

/** The widths the mirror will produce. Asking for anything else is rounded up
 *  there, but naming one of these keeps a URL stable across readers, which is
 *  what lets a proxy cache it. */
export type Width = 128 | 256 | 512

/** A vndb image address: kind, shard, number. Anything else is left alone. */
const VNDB_IMAGE = /^https?:\/\/[^/]+\/(cv|ch|sf|st)\/(\d+)\/(\d+)\.jpg$/

/** Rewrite one address to go through the mirror.
 *
 *  `width` omitted asks for the original, which is what the full-size viewer
 *  wants. An address that is not a vndb image comes back untouched rather than
 *  mangled -- this runs over whatever the API returned. */
export function imageURL(url: string, width?: Width): string {
  const match = VNDB_IMAGE.exec(url)
  if (!match) return url
  const [, kind, shard, num] = match
  return width
    ? `${MIRROR}/${width}/${kind}/${shard}/${num}.jpg`
    : `${MIRROR}/${kind}/${shard}/${num}.jpg`
}

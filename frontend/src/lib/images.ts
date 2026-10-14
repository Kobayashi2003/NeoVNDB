/** The API keeps vndb's image addresses; this rewrites them to the mirror,
 *  whose paths are vndb's, so the edge can serve a stored file without waking
 *  imgserve. Nothing is resized: thumbnails are vndb's own. */

/** `start.ps1 -NoImages`: draw image boxes but fetch nothing. Baked in at
 *  build time (NEXT_PUBLIC_). */
export const IMAGES_OFF = process.env.NEXT_PUBLIC_NO_IMAGES === '1';

/** A path, so it resolves against whatever host served the page. */
const MIRROR = '/imgserve/img';

const VNDB_IMAGE = /^https?:\/\/[^/]+\/(cv|cv\.t|ch|sf|st)\/(\d+)\/(\d+)\.jpg$/;

/** The mirror's address for a vndb image. Non-vndb addresses pass through. */
export function imageURL(url: string): string {
  const match = VNDB_IMAGE.exec(url);
  if (!match) return url;
  const [, kind, shard, num] = match;
  return `${MIRROR}/${kind}/${shard}/${num}.jpg`;
}

/** vndb publishes a cover's thumbnail only when the cover is wider than it;
 *  older covers were stored at that size already. */
const COVER_THUMBNAIL_WIDTH = 256;

/** vndb's own thumbnail of an image, for a small frame: cv.t for a cover wider
 *  than 256px, st for a screenshot; otherwise the original, which is then
 *  already small (covers) or has no thumbnail upstream (portraits). */
export function thumbnailURL(image: { url: string; dims: [number, number] }): string {
  const match = VNDB_IMAGE.exec(image.url);
  if (!match) return image.url;
  const [, kind, shard, num] = match;
  const thumb =
    kind === 'cv' && image.dims[0] > COVER_THUMBNAIL_WIDTH ? 'cv.t' : kind === 'sf' ? 'st' : kind;
  return `${MIRROR}/${thumb}/${shard}/${num}.jpg`;
}

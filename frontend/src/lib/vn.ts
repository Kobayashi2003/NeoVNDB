/** Facts about a visual novel that the dump records against its releases
 *  rather than against the work, and that a reader expects to find on the work. */

import type { Producer, Release } from "./types"

/** Publishers, gathered from the VN's official releases (vndb records them
 *  per release), in first-appearance order so the original comes first. */
export function publishers(releases: Release[]): Producer[] {
  const seen = new Map<string, Producer>()
  for (const release of releases) {
    if (!release.official) continue
    for (const p of release.producers) {
      if (p.publisher && !seen.has(p.id)) seen.set(p.id, p)
    }
  }
  return [...seen.values()]
}

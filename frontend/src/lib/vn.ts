/** Facts about a visual novel that the dump records against its releases
 *  rather than against the work, and that a reader expects to find on the work. */

import type { Producer, Release } from "./types"

/** Who published this, gathered from the releases that say so.
 *
 *  vndb records no publisher on the visual novel itself -- publishing is a
 *  property of a release, and the same work can be published by different
 *  companies in different territories. Unofficial releases are left out: a
 *  fan translation's "publisher" is not one in the sense this row means.
 *  First appearance decides the order, which puts the original publisher
 *  first because releases arrive oldest-first. */
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

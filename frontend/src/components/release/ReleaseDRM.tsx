/** What a release does to stop you copying it.
 *
 *  Two texts sit on each entry and mean different things: the description
 *  belongs to the DRM itself and reads the same everywhere it appears, while
 *  the notes belong to this release's use of it. Kana carries none of this;
 *  it is here because the dump has it. */

import type { Drm } from "@/lib/types"

export function ReleaseDRM({ drm }: { drm: Drm[] }) {
  return (
    <div className="flex flex-col gap-2">
      {drm.map((d) => (
        <div key={d.id} className="rounded-lg border border-white/5 bg-surface px-3 py-2">
          <p className="text-sm font-medium">{d.name}</p>
          {d.description && <p className="mt-0.5 text-xs text-muted">{d.description}</p>}
          {d.notes && <p className="mt-1 text-xs text-white/80">{d.notes}</p>}
        </div>
      ))}
    </div>
  )
}

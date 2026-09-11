/** A character's traits, grouped the way vndb files them.
 *
 *  The character page gives them a section of their own rather than the
 *  compressed run that fits inside a VN page's card, so each group gets its
 *  own heading and the whole set is legible at once. */
"use client"

import Link from "next/link"
import { cn } from "@/lib/utils"
import { groupTraits } from "@/lib/traits"
import { SpoilerReveals } from "@/components/ui/SpoilerReveals"
import { usePrefs } from "@/hooks/usePrefs"
import type { SpoilerControl } from "@/hooks/useSpoilerLevel"
import type { Trait } from "@/lib/types"

export function CharacterTraits({
  traits,
  spoiler,
}: {
  traits: Trait[]
  spoiler: SpoilerControl
}) {
  const { explicit } = usePrefs()
  const grouped = groupTraits(traits, spoiler.level, explicit)

  return (
    <div className="flex flex-col gap-3">
      {grouped.groups.map(([group, list]) => (
        // The group name sits in its own column from sm up, so the eye can run
        // down the headings without reading the traits beside them.
        <div key={group} className="flex flex-col gap-1 sm:flex-row sm:gap-3">
          <p className="shrink-0 pt-1 text-xs font-semibold uppercase tracking-wider text-muted sm:w-32">
            {group}
          </p>
          <div className="flex min-w-0 flex-1 flex-wrap gap-1.5">
            {list.map((t) => (
              <Link
                key={t.id}
                href={`/${t.id}`}
                title={t.lie ? "Flagged as untrue" : undefined}
                className={cn(
                  "inline-flex items-center rounded-full px-2.5 py-1 text-xs transition-colors",
                  // A trait flagged as a lie is kept visible but struck: it is
                  // part of what was assigned, and hiding it would be too.
                  t.lie
                    ? "bg-white/5 text-muted line-through hover:bg-white/10"
                    : "bg-white/10 text-white/90 hover:bg-white/20",
                  t.spoiler === 1 && "border border-yellow-500/30",
                  t.spoiler === 2 && "border border-orange-500/40",
                )}
              >
                {t.name}
              </Link>
            ))}
          </div>
        </div>
      ))}

      {(grouped.hiddenMinor > 0 || grouped.hiddenMajor > 0) && (
        <div className="flex flex-wrap gap-1.5">
          <SpoilerReveals
            minor={grouped.hiddenMinor}
            major={grouped.hiddenMajor}
            noun="trait"
            className="py-1"
            onReveal={spoiler.set}
          />
        </div>
      )}
    </div>
  )
}

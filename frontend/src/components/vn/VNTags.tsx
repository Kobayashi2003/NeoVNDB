/** Tags by category with their scores. Hidden spoilers are revealed from
 *  the end of their own category's row. */
"use client"

import Link from "next/link"
import { cn } from "@/lib/utils"
import { enumLabel } from "@/lib/enums"
import { useSpoilerLevel } from "@/hooks/useSpoilerLevel"
import { SpoilerReveals } from "@/components/ui/SpoilerReveals"
import { display } from "@/lib/format"
import { usePrefs } from "@/hooks/usePrefs"
import type { Tag } from "@/lib/types"

const CATEGORIES = ["cont", "ero", "tech"] as const

export function VNTags({ tags }: { tags: Tag[] }) {
  const { explicit, original } = usePrefs()
  const spoiler = useSpoilerLevel(
    tags.some((t) => t.spoiler === 1),
    tags.some((t) => t.spoiler === 2),
  )

  return (
    <div className="flex flex-col gap-4">
      {CATEGORIES.map((category) => {
        const all = tags
          .filter((t) => t.category === category)
          .sort((a, b) => b.rating - a.rating)
        if (all.length === 0) return null

        // The sexual-content group names acts outright, so it answers to the
        // content level rather than to the spoiler level -- a reader revealing
        // spoilers has not thereby asked to be shown this.
        if (category === "ero" && !explicit) {
          return (
            <div key={category}>
              <CategoryHeading category={category} />
              <p className="text-xs italic text-muted">
                Set the sexual content level to Explicit to see{" "}
                {all.length === 1 ? "this tag" : `these ${all.length} tags`}.
              </p>
            </div>
          )
        }

        const shown = all.filter((t) => t.spoiler <= spoiler.level)
        const minor = all.filter((t) => t.spoiler === 1 && spoiler.level < 1).length
        const major = all.filter((t) => t.spoiler === 2 && spoiler.level < 2).length

        return (
          <div key={category}>
            <CategoryHeading category={category} />
            <div className="flex flex-wrap gap-1.5">
              {shown.map((tag) => (
                <Link
                  key={tag.id}
                  href={`/${tag.id}`}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs transition-colors",
                    // A tag flagged as a lie is kept visible but struck: it is
                    // part of what the votes said, and hiding it would be too.
                    tag.lie
                      ? "bg-white/5 text-muted line-through hover:bg-white/10"
                      : "bg-white/10 text-white/90 hover:bg-white/20",
                    tag.spoiler === 1 && "border border-yellow-500/30",
                    tag.spoiler === 2 && "border border-orange-500/40",
                  )}
                >
                  <span>{display(tag.name, tag.translation?.name ?? null, original)}</span>
                  <span
                    className={cn(
                      "font-mono",
                      tag.rating >= 2.5 ? "text-accent" : "text-muted",
                    )}
                  >
                    {tag.rating.toFixed(1)}
                  </span>
                </Link>
              ))}

              <SpoilerReveals minor={minor} major={major} className="py-1" onReveal={spoiler.set} />
            </div>
          </div>
        )
      })}

      {spoiler.level > 0 && (
        <button onClick={() => spoiler.set(0)} className="self-start text-xs text-muted hover:text-white">
          Hide spoilers
        </button>
      )}
    </div>
  )
}

function CategoryHeading({ category }: { category: string }) {
  return (
    <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">
      {enumLabel("CATEGORY", category)}
    </p>
  )
}

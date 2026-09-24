/** The works a character appears in, by role or by date. Voice credits
 *  hang off each appearance: vndb records them per work, character and actor. */
"use client"

import { useState } from "react"
import Link from "next/link"
import { cn } from "@/lib/utils"
import { CHARACTER_ROLE_CLASS, enumLabel } from "@/lib/enums"
import { ROLE_ORDER } from "@/lib/characters"
import { releaseDate } from "@/lib/format"
import { Segmented, type Option } from "@/components/ui/Segmented"
import { SpoilerReveals } from "@/components/ui/SpoilerReveals"
import type { SpoilerControl } from "@/hooks/useSpoilerLevel"
import type { Appearance, Seiyuu } from "@/lib/types"

type Order = "role" | "date"

const ORDERS: Option<Order>[] = [
  { value: "role", label: "By role" },
  { value: "date", label: "By date" },
]

function rank(role: string): number {
  const at = ROLE_ORDER.indexOf(role)
  return at === -1 ? ROLE_ORDER.length : at
}

export function CharacterAppearances({
  appearances,
  seiyuu,
  spoiler,
}: {
  appearances: Appearance[]
  seiyuu: Seiyuu[]
  spoiler: SpoilerControl
}) {
  const [order, setOrder] = useState<Order>("role")

  // Which actor voiced this character in which work.
  const voices = new Map<string, Seiyuu[]>()
  for (const s of seiyuu) {
    voices.set(s.vn, [...(voices.get(s.vn) ?? []), s])
  }

  const shown = appearances.filter((a) => a.spoiler <= spoiler.level)
  const hiddenMinor = appearances.filter((a) => a.spoiler === 1 && spoiler.level < 1).length
  const hiddenMajor = appearances.filter((a) => a.spoiler === 2 && spoiler.level < 2).length

  const sorted = [...shown].sort((a, b) =>
    order === "role"
      ? rank(a.role) - rank(b.role) || a.released.localeCompare(b.released)
      : a.released.localeCompare(b.released) || rank(a.role) - rank(b.role),
  )

  return (
    <div className="flex flex-col gap-3">
      <Segmented
        label="Order appearances by"
        value={order}
        options={ORDERS}
        onChange={setOrder}
        className="self-start"
      />

      <div className="rounded-lg border border-white/5 bg-surface">
        {sorted.map((a) => (
          <div
            key={a.id}
            className={cn(
              "flex flex-col gap-1 border-b border-white/5 px-3 py-2 last:border-0",
              "sm:flex-row sm:items-baseline sm:gap-3",
              // A revealed spoiler appearance keeps its colour, the way a
              // spoiler character does on a visual novel's page.
              a.spoiler === 2
                ? "border-l-2 border-l-orange-500/50"
                : a.spoiler === 1
                  ? "border-l-2 border-l-yellow-500/40"
                  : "",
            )}
          >
            <span
              className={cn(
                "shrink-0 self-start rounded px-1.5 py-0.5 text-xs font-medium sm:w-28 sm:text-center",
                CHARACTER_ROLE_CLASS[a.role] ?? "bg-white/10 text-white/60",
              )}
            >
              {enumLabel("CHARACTER_ROLE", a.role)}
            </span>

            <div className="min-w-0 flex-1">
              <Link href={`/${a.id}`} className="text-sm leading-snug transition-colors hover:text-accent coarse:py-1">
                {a.title}
              </Link>
              {a.release && (
                <p className="mt-0.5 truncate text-xs text-muted">
                  Only in{" "}
                  <Link href={`/${a.release}`} className="hover:text-white/70">
                    {a.release}
                  </Link>
                </p>
              )}
              {voices.get(a.id)?.map((s, i) => (
                <p key={`${s.id}-${i}`} className="mt-0.5 truncate text-xs text-muted">
                  <span className="text-muted/60">CV </span>
                  <Link href={`/${s.id}`} className="hover:text-accent coarse:py-1">
                    {s.name}
                  </Link>
                  {s.note && <span className="text-muted/60"> ({s.note})</span>}
                </p>
              ))}
            </div>

            <span className="shrink-0 text-xs tabular-nums text-muted">
              {releaseDate(a.released)}
            </span>
          </div>
        ))}
      </div>

      {(hiddenMinor > 0 || hiddenMajor > 0) && (
        <div className="flex flex-wrap gap-1.5">
          <SpoilerReveals
            minor={hiddenMinor}
            major={hiddenMajor}
            noun="appearance"
            className="py-1"
            onReveal={spoiler.set}
          />
        </div>
      )}
    </div>
  )
}

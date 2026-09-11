/** The characters section: how many there are, which of them to show, and in
 *  what form.
 *
 *  Two layouts, because two readers want different things. The grid answers
 *  "who is in this" -- portraits at a glance, filtered by role. The slider
 *  answers "who is this" -- one full card at a time. The choice is a saved
 *  preference, since a reader who prefers one prefers it everywhere.
 *
 *  Spoilers are coloured rather than merely hidden: yellow for minor, orange
 *  for major, on the trait that carries one and on the edge of a card that is
 *  itself one. What is still hidden is counted in its own tile, so the reader
 *  can see how much is behind the door before opening it. */
"use client"

import { useState } from "react"
import { LayoutGrid, Rows3 } from "lucide-react"
import { cn } from "@/lib/utils"
import { enumLabel } from "@/lib/enums"
import { ROLE_ORDER, spoilerExtent } from "@/lib/characters"
import { useSpoilerLevel } from "@/hooks/useSpoilerLevel"
import { TabBar, type Tab } from "@/components/ui/TabBar"
import { Tooltip } from "@/components/ui/Tooltip"
import { VNCharacterTile } from "./VNCharacterTile"
import { VNCharacterSlider } from "./VNCharacterSlider"
import { usePrefs, type CharacterLayout } from "@/hooks/usePrefs"
import type { Character } from "@/lib/types"

const ALL = "all"

export function VNCharacters({
  characters,
  onExpand,
}: {
  characters: Character[]
  /** Open the expanded view, optionally on one character. */
  onExpand: (id: string | null) => void
}) {
  const { explicit, layout, set } = usePrefs()
  const [role, setRole] = useState(ALL)

  const extent = spoilerExtent(characters, explicit)
  const spoiler = useSpoilerLevel(extent.minor, extent.major)

  // Role counts ignore the spoiler level: a tab that changed its number as
  // spoilers opened would itself leak how many are hidden behind each role.
  const tabs: Tab[] = [
    { value: ALL, label: "All", count: characters.length },
    ...ROLE_ORDER.map((r) => ({
      value: r,
      label: enumLabel("CHARACTER_ROLE", r),
      count: characters.filter((c) => c.role === r).length,
    })).filter((t) => t.count > 0),
  ]

  const inRole = role === ALL ? characters : characters.filter((c) => c.role === role)
  const shown = inRole.filter((c) => c.spoiler <= spoiler.level)
  const hiddenMinor = inRole.filter((c) => c.spoiler === 1 && spoiler.level < 1).length
  const hiddenMajor = inRole.filter((c) => c.spoiler === 2 && spoiler.level < 2).length

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <TabBar tabs={tabs} active={role} onChange={setRole} />
        <div className="flex items-center gap-3">
          {spoiler.any && (
            <button
              onClick={spoiler.cycle}
              className={cn("shrink-0 py-1 text-xs transition-colors", spoiler.className)}
            >
              {spoiler.label}
            </button>
          )}
          <LayoutToggle layout={layout} onChange={(layout) => set({ layout })} />
        </div>
      </div>

      {layout === "slider" ? (
        <VNCharacterSlider
          characters={shown}
          spoilerLevel={spoiler.level}
          onExpand={onExpand}
        />
      ) : (
        <div className="grid grid-cols-2 items-stretch gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-3 xl:grid-cols-4">
          {shown.map((c) => (
            <VNCharacterTile key={c.id} character={c} spoilerLevel={spoiler.level} />
          ))}

          {hiddenMinor > 0 && (
            <HiddenTile count={hiddenMinor} tone="minor" onReveal={() => spoiler.set(1)} />
          )}
          {hiddenMajor > 0 && (
            <HiddenTile count={hiddenMajor} tone="major" onReveal={() => spoiler.set(2)} />
          )}
        </div>
      )}
    </div>
  )
}

function LayoutToggle({
  layout,
  onChange,
}: {
  layout: CharacterLayout
  onChange: (layout: CharacterLayout) => void
}) {
  const next = layout === "grid" ? "slider" : "grid"
  const Glyph = layout === "grid" ? Rows3 : LayoutGrid
  return (
    <Tooltip label={next === "slider" ? "One character at a time" : "Show every character"}>
      <button
        type="button"
        onClick={() => onChange(next)}
        aria-label={next === "slider" ? "Switch to one at a time" : "Switch to a grid"}
        className="rounded-full p-1.5 text-muted transition-colors hover:bg-white/10 hover:text-white"
      >
        <Glyph className="h-4 w-4" aria-hidden />
      </button>
    </Tooltip>
  )
}

/** A grid cell standing in for the characters a spoiler level is holding back,
 *  so the gap in the grid is legible rather than merely absent. */
function HiddenTile({
  count,
  tone,
  onReveal,
}: {
  count: number
  tone: "minor" | "major"
  onReveal: () => void
}) {
  const minor = tone === "minor"
  return (
    <button
      onClick={onReveal}
      className={cn(
        "flex h-full min-h-48 flex-col items-center justify-center gap-1.5 rounded-lg border p-4 transition-colors",
        minor
          ? "border-yellow-500/20 bg-yellow-500/5 hover:bg-yellow-500/10"
          : "border-orange-500/20 bg-orange-500/5 hover:bg-orange-500/10",
      )}
    >
      <span className={cn("text-sm font-semibold", minor ? "text-yellow-400" : "text-orange-400")}>
        +{count}
      </span>
      <span
        className={cn(
          "text-center text-xs leading-relaxed",
          minor ? "text-yellow-500/70" : "text-orange-500/70",
        )}
      >
        {tone} spoiler character{count === 1 ? "" : "s"}
      </span>
      <span className={cn("text-xs", minor ? "text-yellow-500/40" : "text-orange-500/40")}>
        click to reveal
      </span>
    </button>
  )
}

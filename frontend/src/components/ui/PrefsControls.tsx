/** The one place the reading preferences are set, on every page.
 *
 *  The two content scales sit side by side because they are read together:
 *  what a reader will look at is one answer with two axes, not two unrelated
 *  switches. Below sm they each take a row instead of sharing one: a scale
 *  squeezed to a third of a phone's width shows "Expl" clipped to "Exp",
 *  which is worse than a second line. */
"use client"

import { Languages } from "lucide-react"
import { cn } from "@/lib/utils"
import { Segmented, type Option } from "@/components/ui/Segmented"
import { Tooltip } from "@/components/ui/Tooltip"
import type { SexualLevel, ViolenceLevel } from "@/lib/content"
import { usePrefs } from "@/hooks/usePrefs"

const SEXUAL: Option<SexualLevel>[] = [
  { value: "safe", label: "Safe" },
  { value: "suggestive", label: "Suggestive", short: "Sugg", activeClass: "bg-yellow-500/80 text-black" },
  { value: "explicit", label: "Explicit", short: "Expl", activeClass: "bg-red-500/80 text-white" },
]

const VIOLENCE: Option<ViolenceLevel>[] = [
  { value: "tame", label: "Tame" },
  { value: "violent", label: "Violent", short: "Viol", activeClass: "bg-orange-500/80 text-black" },
  { value: "brutal", label: "Brutal", short: "Brut", activeClass: "bg-red-800/80 text-white" },
]

/** Which script names are shown in. Apart from the two scales because it
 *  belongs with the title it changes -- a detail page puts it in the header,
 *  beside the other things that act on what is being read, while the scales
 *  stay with the rest of the reading settings. */
export function OriginalToggle({ className }: { className?: string }) {
  const p = usePrefs()

  return (
    <Tooltip label="Show titles and names in their original script">
      <button
        type="button"
        onClick={() => p.set({ original: !p.original })}
        aria-pressed={p.original}
        className={cn(
          "flex shrink-0 items-center gap-1 rounded-full border border-white/10 px-2.5 py-1.5 text-xs font-medium transition-colors",
          p.original ? "bg-accent text-black" : "text-muted hover:bg-white/10 hover:text-white",
          className,
        )}
      >
        <Languages className="h-3.5 w-3.5" aria-hidden />
        Original
      </button>
    </Tooltip>
  )
}

/** The two content scales, which are read together: what a reader will look at
 *  is one answer with two axes, not two unrelated switches. */
export function ContentLevels({ className }: { className?: string }) {
  const p = usePrefs()

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      <Segmented
        label="Sexual content"
        value={p.sexual}
        options={SEXUAL}
        onChange={(sexual) => p.set({ sexual })}
        className="w-full sm:w-auto"
      />
      <Segmented
        label="Violent content"
        value={p.violence}
        options={VIOLENCE}
        onChange={(violence) => p.set({ violence })}
        className="w-full sm:w-auto"
      />
    </div>
  )
}

/** All of them together, for the listings, where there is one row of controls
 *  and no header to split them between. */
export function PrefsControls({ className }: { className?: string }) {
  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      <OriginalToggle />
      <ContentLevels />
    </div>
  )
}

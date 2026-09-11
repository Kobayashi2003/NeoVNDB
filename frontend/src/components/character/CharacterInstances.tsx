/** The instance group: one character as several database entries.
 *
 *  vndb files a character who recurs across unrelated works -- a mascot, a
 *  Vocaloid, a cameo -- as one entry per work, all pointing at a single parent
 *  through chars.main. The pointer only goes one way, so the group is read
 *  from whichever end the reader arrived at: a parent lists its instances
 *  directly, an instance is handed its parent's list.
 *
 *  Being an instance can itself be a spoiler -- that this character turns out
 *  to be a version of that one is exactly the kind of thing a work withholds
 *  -- so each link carries its own level. */
"use client"

import Link from "next/link"
import { cn } from "@/lib/utils"
import { display } from "@/lib/format"
import { shouldBlur } from "@/lib/content"
import { ImageWithFallback } from "@/components/ui/ImageWithFallback"
import { SpoilerReveals } from "@/components/ui/SpoilerReveals"
import { usePrefs } from "@/hooks/usePrefs"
import type { SpoilerControl } from "@/hooks/useSpoilerLevel"
import type { Instance } from "@/lib/types"

export function CharacterInstances({
  parent,
  instances,
  currentId,
  spoiler,
}: {
  /** The character at the top of the group, when this page is not it. */
  parent: Instance | null
  instances: Instance[]
  currentId: string
  spoiler: SpoilerControl
}) {
  const shown = instances.filter((c) => c.spoiler <= spoiler.level)
  const hiddenMinor = instances.filter((c) => c.spoiler === 1 && spoiler.level < 1).length
  const hiddenMajor = instances.filter((c) => c.spoiler === 2 && spoiler.level < 2).length

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-3 xl:grid-cols-4">
        {parent && <InstanceTile character={parent} currentId={currentId} isParent />}
        {shown.map((c) => (
          <InstanceTile key={c.id} character={c} currentId={currentId} />
        ))}
      </div>

      {(hiddenMinor > 0 || hiddenMajor > 0) && (
        <div className="flex flex-wrap gap-1.5">
          <SpoilerReveals
            minor={hiddenMinor}
            major={hiddenMajor}
            noun="instance"
            className="py-1"
            onReveal={spoiler.set}
          />
        </div>
      )}
    </div>
  )
}

function InstanceTile({
  character,
  currentId,
  isParent,
}: {
  character: Instance
  currentId: string
  isParent?: boolean
}) {
  const { original, sexual, violence } = usePrefs()
  const here = character.id === currentId
  const blur =
    !!character.image &&
    shouldBlur(character.image.sexual, character.image.violence, sexual, violence)

  const body = (
    <>
      <div className="relative aspect-[17/20] w-full shrink-0 overflow-hidden bg-elevated">
        {character.image ? (
          <ImageWithFallback
            src={character.image.url}
            alt={character.name}
            width={character.image.dims[0]}
            height={character.image.dims[1]}
            wrapperClassName="h-full w-full"
            className={cn(
              "h-full w-full object-cover object-top transition-[filter] duration-300",
              blur && "scale-105 blur-xl",
            )}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-muted">
            No image
          </div>
        )}
      </div>
      <div className="flex flex-col gap-0.5 p-2">
        <p className="truncate text-xs font-semibold">
          {display(character.name, character.original, original)}
        </p>
        {(isParent || here) && (
          <p className="text-xs text-muted">{here ? "This page" : "The original"}</p>
        )}
      </div>
    </>
  )

  const frame = cn(
    "flex h-full flex-col overflow-hidden rounded-lg border bg-surface",
    here
      ? "border-accent/50"
      : character.spoiler === 2
        ? "border-orange-500/50"
        : character.spoiler === 1
          ? "border-yellow-500/40"
          : "border-white/5",
  )

  // The entry the reader is already on is shown for context, not as a way back
  // to itself.
  if (here) return <div className={frame}>{body}</div>

  return (
    <Link href={`/${character.id}`} className={cn(frame, "transition-transform duration-200 hover:scale-[1.02] hover:border-white/20")}>
      {body}
    </Link>
  )
}

/** One character as a grid tile: portrait, role, name, sex and voice credits.
 *
 *  The tile is uniform on purpose -- a grid that reflows to each portrait's
 *  shape stops being scannable -- so the image is cropped to the ratio vndb
 *  stores most of them at, which leaves the common case untouched. The card
 *  form is where a portrait is shown whole. */
"use client"

import Link from "next/link"
import { cn } from "@/lib/utils"
import { ICON } from "@/lib/icons"
import { CHARACTER_ROLE_TEXT, enumLabel } from "@/lib/enums"
import { readSex } from "@/lib/characters"
import { display } from "@/lib/format"
import { shouldBlur } from "@/lib/content"
import { ImageWithFallback } from "@/components/ui/ImageWithFallback"
import { Tooltip } from "@/components/ui/Tooltip"
import { usePrefs } from "@/hooks/usePrefs"
import { SexLine } from "@/components/character/SexLine"
import type { Character } from "@/lib/types"

const SEX = ICON.CHARACTER_SEX as Record<string, string>

export function VNCharacterTile({
  character,
  spoilerLevel,
}: {
  character: Character
  spoilerLevel: number
}) {
  const { original, sexual, violence } = usePrefs()
  const blur =
    !!character.image &&
    shouldBlur(character.image.sexual, character.image.violence, sexual, violence)
  const sex = readSex(character.sex, character.spoil_sex, spoilerLevel)

  return (
    <Link href={`/${character.id}`} className="group block h-full">
      <div
        className={cn(
          "flex h-full flex-col overflow-hidden rounded-lg border bg-surface transition-transform duration-200 hover:scale-[1.02]",
          // The edge carries the character's own spoiler weight, so a revealed
          // one stands apart from the characters that were always shown.
          character.spoiler === 2
            ? "border-orange-500/50 hover:border-orange-500/70"
            : character.spoiler === 1
              ? "border-yellow-500/40 hover:border-yellow-500/60"
              : "border-white/5 hover:border-white/20",
        )}
      >
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
          <span
            className={cn(
              "absolute inset-x-0 bottom-0 bg-linear-to-t from-black/85 to-transparent px-2 py-1.5 text-xs",
              CHARACTER_ROLE_TEXT[character.role] ?? "text-white/70",
            )}
          >
            {enumLabel("CHARACTER_ROLE", character.role)}
          </span>
        </div>

        <div className="flex min-h-18 flex-1 flex-col gap-0.5 overflow-hidden p-2">
          <p className="truncate text-xs font-semibold">
            {display(character.name, character.original, original)}
          </p>

          {sex && (
            <SexLine
              reading={sex}
              icon={SEX[sex.code] ?? ""}
              className="text-xs text-muted/80"
            />
          )}

          {character.seiyuu.length > 0 && (
            <p className="truncate text-xs text-muted/80">
              <span className="text-muted/60">CV </span>
              {character.seiyuu.map((s, i) => (
                <Tooltip key={`${s.id}-${i}`} label={s.note}>
                  <span>
                    {i > 0 && ", "}
                    {s.name}
                  </span>
                </Tooltip>
              ))}
            </p>
          )}
        </div>
      </div>
    </Link>
  )
}

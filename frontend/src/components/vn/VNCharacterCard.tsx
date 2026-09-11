/** Everything the VN page knows about one character, in one card.
 *
 *  This is the form the slider and the expanded view share. Unlike the grid
 *  tile it shows the portrait whole and spells out the physical details, the
 *  aliases and the description -- the tile answers "who is in this", the card
 *  answers "who is this".
 *
 *  Spoiler traits reveal per card as well as section-wide: a reader who opens
 *  one character should not have to unlock every other one to do it. The
 *  effective level never drops below what the section has already revealed. */
"use client"

import { useState } from "react"
import Link from "next/link"
import { cn } from "@/lib/utils"
import { ICON } from "@/lib/icons"
import { CHARACTER_ROLE_CLASS, enumLabel } from "@/lib/enums"
import { readSex } from "@/lib/characters"
import { groupTraits } from "@/lib/traits"
import { birthday, bust, display } from "@/lib/format"
import { shouldBlur } from "@/lib/content"
import { BBCode } from "@/lib/bbcode"
import { Cover } from "@/components/ui/Cover"
import { InlineList } from "@/components/ui/InfoCard"
import { SpoilerReveals } from "@/components/ui/SpoilerReveals"
import { usePrefs } from "@/hooks/usePrefs"
import { SexLine } from "@/components/character/SexLine"
import type { Character } from "@/lib/types"
import type { SpoilerLevel } from "@/hooks/useSpoilerLevel"

const SEX = ICON.CHARACTER_SEX as Record<string, string>

/** A run of "label value" pairs on one line, separated by dim middots. Absent
 *  values drop out, and a line with nothing left does not render. */
function Stats({ items }: { items: [string, React.ReactNode][] }) {
  const present = items.filter(([, value]) => value !== null && value !== undefined)
  if (present.length === 0) return null
  return (
    <div className="flex flex-wrap items-baseline gap-y-0.5 text-xs">
      {present.map(([label, value], i) => (
        <span key={label} className="inline-flex items-baseline">
          {i > 0 && <span className="mx-2 text-white/20">&middot;</span>}
          <span className="mr-1 text-muted">{label}</span>
          <span className="text-white/90">{value}</span>
        </span>
      ))}
    </div>
  )
}

export function VNCharacterCard({
  character,
  spoilerLevel,
  clamp,
  onExpand,
}: {
  character: Character
  spoilerLevel: SpoilerLevel
  /** Cap the height and close it with a fade -- the slider's preview form. */
  clamp?: boolean
  /** Invoked from the fade, to open this character in the expanded view. */
  onExpand?: () => void
}) {
  const { original, explicit, sexual, violence } = usePrefs()
  const [revealed, setRevealed] = useState<SpoilerLevel>(0)

  const level = Math.max(spoilerLevel, revealed) as SpoilerLevel
  const traits = groupTraits(character.traits, level, explicit)
  const sex = readSex(character.sex, character.spoil_sex, level)
  const gender = readSex(character.gender, character.spoil_gender, level)
  const blur =
    !!character.image &&
    shouldBlur(character.image.sexual, character.image.violence, sexual, violence)

  const aliases = character.aliases.filter((a) => a.spoiler <= level)

  return (
    <div
      className={cn(
        "relative gap-4 rounded-lg border bg-surface p-3",
        character.spoiler === 2
          ? "border-orange-500/50"
          : character.spoiler === 1
            ? "border-yellow-500/40"
            : "border-white/5",
        // The clamped preview keeps the portrait beside the text at every
        // width, because it is already height-limited; the full card stacks
        // them on a phone, where a side-by-side portrait leaves no room to read.
        clamp
          ? "flex max-h-80 overflow-hidden"
          : "flex flex-col items-center sm:flex-row sm:items-stretch",
      )}
    >
      {character.image && (
        <Cover
          image={character.image}
          alt={character.name}
          blurred={blur}
          className="w-28 shrink-0 self-start sm:w-32"
        />
      )}

      {/* w-full so the text spans when it sits under a centred portrait. */}
      <div className="flex w-full min-w-0 flex-1 flex-col gap-2">
        <div className="flex items-start justify-between gap-2">
          <Link
            href={`/${character.id}`}
            className="text-sm font-semibold leading-snug transition-colors hover:text-accent"
          >
            {display(character.name, character.original, original)}
          </Link>
          <span
            className={cn(
              "shrink-0 rounded px-1.5 py-0.5 text-xs font-medium",
              CHARACTER_ROLE_CLASS[character.role] ?? "bg-white/10 text-white/60",
            )}
          >
            {enumLabel("CHARACTER_ROLE", character.role)}
          </span>
        </div>

        {sex && <SexLine reading={sex} icon={SEX[sex.code] ?? ""} className="text-xs" />}
        {gender && (
          <SexLine
            reading={gender}
            icon={SEX[gender.code] ?? ""}
            className="text-xs text-white/70"
          />
        )}

        <Stats
          items={[
            ["Age", character.age],
            ["Birthday", birthday(character.birthday)],
            ["Blood", character.blood_type?.toUpperCase() ?? null],
          ]}
        />
        <Stats
          items={[
            ["Height", character.height && `${character.height} cm`],
            ["Weight", character.weight && `${character.weight} kg`],
          ]}
        />
        <Stats
          items={[
            ["Bust", bust(character.bust, character.cup)],
            ["Waist", character.waist && `${character.waist} cm`],
            ["Hips", character.hips && `${character.hips} cm`],
          ]}
        />

        {aliases.length > 0 && (
          <p className="text-xs">
            <span className="mr-1 text-muted">Aliases</span>
            <InlineList items={aliases.map((a) => display(a.latin, a.name, original) || a.name)} />
          </p>
        )}

        {character.seiyuu.length > 0 && (
          <p className="flex flex-wrap items-baseline gap-x-1 text-xs">
            <span className="mr-1 text-muted">CV</span>
            <InlineList
              items={character.seiyuu.map((s, i) => (
                <Link
                  key={`${s.id}-${i}`}
                  href={`/${s.id}`}
                  className="transition-colors hover:text-accent"
                >
                  {s.name}
                  {s.note && <span className="text-muted/60"> ({s.note})</span>}
                </Link>
              ))}
            />
          </p>
        )}

        {(traits.groups.length > 0 || traits.hiddenMinor > 0 || traits.hiddenMajor > 0) && (
          <div className="mt-0.5 flex flex-col gap-1.5">
            {traits.groups.map(([group, list]) => (
              <div key={group}>
                <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted">
                  {group}
                </p>
                <div className="flex flex-wrap gap-1">
                  {list.map((t) => (
                    <Link
                      key={t.id}
                      href={`/${t.id}`}
                      title={t.lie ? "Flagged as untrue" : undefined}
                      className={cn(
                        "inline-flex items-center rounded-full px-2 py-0.5 text-xs transition-colors",
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

            {(traits.hiddenMinor > 0 || traits.hiddenMajor > 0) && (
              <div className="flex flex-wrap gap-1.5">
                <SpoilerReveals
                  minor={traits.hiddenMinor}
                  major={traits.hiddenMajor}
                  noun="trait"
                  onReveal={(to) => setRevealed((at) => (to > at ? to : at))}
                />
              </div>
            )}
          </div>
        )}

        {character.description && (
          <div className="mt-0.5">
            <BBCode text={character.description} />
          </div>
        )}
      </div>

      {/* The fade says there is more below the cut, and is the way to it. */}
      {clamp && onExpand && (
        <button
          type="button"
          onClick={onExpand}
          className="group/fade absolute inset-x-0 bottom-0 flex items-end justify-center bg-linear-to-t from-black/95 via-black/70 to-transparent pb-2.5 pt-20"
        >
          <span className="text-xs font-medium text-white/70 transition-colors group-hover/fade:text-accent">
            Show full details &rsaquo;
          </span>
        </button>
      )}
    </div>
  )
}

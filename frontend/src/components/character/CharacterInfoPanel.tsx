/** The character sidebar: the portrait, then what the dump records about the
 *  person rather than about their appearances. */
"use client"

import { ICON } from "@/lib/icons"
import { readSex } from "@/lib/characters"
import { birthday, bust, display } from "@/lib/format"
import { shouldBlur } from "@/lib/content"
import { Cover } from "@/components/ui/Cover"
import { InfoCard, InfoRow, InlineList } from "@/components/ui/InfoCard"
import { usePrefs } from "@/hooks/usePrefs"
import type { SpoilerControl } from "@/hooks/useSpoilerLevel"
import { SexLine } from "./SexLine"
import type { CharacterDetail } from "@/lib/types"

const SEX = ICON.CHARACTER_SEX as Record<string, string>

export function CharacterInfoPanel({
  character,
  spoiler,
}: {
  character: CharacterDetail
  spoiler: SpoilerControl
}) {
  const { original, sexual, violence } = usePrefs()
  const blur =
    !!character.image &&
    shouldBlur(character.image.sexual, character.image.violence, sexual, violence)

  const sex = readSex(character.sex, character.spoil_sex, spoiler.level)
  const gender = readSex(character.gender, character.spoil_gender, spoiler.level, "GENDER")
  const aliases = character.aliases.filter((a) => a.spoiler <= spoiler.level)

  return (
    // Stacked below lg the portrait sits beside the facts rather than above
    // them, for the same reason a cover does on a visual novel's page.
    <div className="flex gap-3 lg:flex-col">
      {character.image && (
        <Cover
          image={character.image}
          alt={character.name}
          blurred={blur}
          className="w-32 shrink-0 self-start border border-white/5 sm:w-40 lg:w-full"
        />
      )}

      <InfoCard className="min-w-0 flex-1 lg:flex-none">
        {sex && (
          <InfoRow label="Sex">
            <SexLine reading={sex} icon={SEX[sex.code] ?? ""} />
          </InfoRow>
        )}
        {gender && (
          <InfoRow label="Gender">
            <SexLine reading={gender} icon={SEX[gender.code] ?? ""} />
          </InfoRow>
        )}
        {character.age !== null && <InfoRow label="Age">{character.age}</InfoRow>}
        {birthday(character.birthday) && (
          <InfoRow label="Birthday">{birthday(character.birthday)}</InfoRow>
        )}
        {character.blood_type && (
          <InfoRow label="Blood type">{character.blood_type.toUpperCase()}</InfoRow>
        )}
        {character.height !== null && <InfoRow label="Height">{character.height} cm</InfoRow>}
        {character.weight !== null && <InfoRow label="Weight">{character.weight} kg</InfoRow>}
        {bust(character.bust, character.cup) && (
          <InfoRow label="Bust">{bust(character.bust, character.cup)}</InfoRow>
        )}
        {character.waist !== null && <InfoRow label="Waist">{character.waist} cm</InfoRow>}
        {character.hips !== null && <InfoRow label="Hips">{character.hips} cm</InfoRow>}
        {aliases.length > 0 && (
          <InfoRow label="Aliases">
            <span className="text-muted">
              <InlineList
                items={aliases.map((a) => display(a.latin, a.name, original) || a.name)}
              />
            </span>
          </InfoRow>
        )}
      </InfoCard>
    </div>
  )
}

/** The character page.
 *
 *  One spoiler control, not one per section. A visual novel's page hides the
 *  control where there is nothing behind it because its spoilers sit in
 *  separate places a reader browses independently; here they run through
 *  everything at once -- the sex in the sidebar, the traits, the works, the
 *  instance links -- and a reader who has opened a character has already
 *  decided how much they want to know about them. Each section still counts
 *  what it is holding back where it would have been, so the shape of what is
 *  missing stays visible. */
"use client"

import { BBCode } from "@/lib/bbcode"
import { characterSpoilerExtent } from "@/lib/characters"
import { display } from "@/lib/format"
import { cn } from "@/lib/utils"
import { Collapsible } from "@/components/ui/Collapsible"
import { DetailHeader, DetailShell } from "@/components/ui/DetailShell"
import { InfoCard } from "@/components/ui/InfoCard"
import { Section } from "@/components/ui/Section"
import { ContentLevels } from "@/components/ui/PrefsControls"
import { DetailControls } from "@/components/ui/DetailControls"
import { usePrefs } from "@/hooks/usePrefs"
import { useSpoilerLevel } from "@/hooks/useSpoilerLevel"
import { CharacterAppearances } from "./CharacterAppearances"
import { CharacterInfoPanel } from "./CharacterInfoPanel"
import { CharacterInstances } from "./CharacterInstances"
import { CharacterTraits } from "./CharacterTraits"
import type { CharacterDetail, Instance } from "@/lib/types"

export function CharacterPage({
  character,
  parent,
}: {
  character: CharacterDetail
  /** The character at the top of the instance group, when this one is not it.
   *  chars.main only points one way, so the siblings come from up there. */
  parent: { character: Instance; instances: Instance[] } | null
}) {
  const { original, explicit } = usePrefs()
  const extent = characterSpoilerExtent(character, explicit)
  const spoiler = useSpoilerLevel(extent.minor, extent.major)

  const group = parent ? parent.instances : character.instances
  const hasGroup = group.length > 0 || parent !== null

  return (
    <DetailShell
      header={
        <DetailHeader
          title={display(character.name, character.original, original) || character.id}
          subtitle={
            character.original && (
              <p className="mt-1 text-sm text-muted">
                {display(character.original, character.name, original)}
              </p>
            )
          }
          action={
            <DetailControls id={character.id}>
              {spoiler.any && (
                <button
                  onClick={spoiler.cycle}
                  className={cn("shrink-0 text-xs transition-colors", spoiler.className)}
                >
                  {spoiler.label}
                </button>
              )}
            </DetailControls>
          }
        />
      }
      aside={
        <>
          <ContentLevels className="flex-col items-stretch" />
          <CharacterInfoPanel character={character} spoiler={spoiler} />
        </>
      }
    >
      {character.description && (
        <Section title="Description">
          <InfoCard padding="block">
            <Collapsible>
              <BBCode text={character.description} />
            </Collapsible>
          </InfoCard>
        </Section>
      )}

      {character.traits.length > 0 && (
        <Section title="Traits" count={character.traits.length}>
          <CharacterTraits traits={character.traits} spoiler={spoiler} />
        </Section>
      )}

      {character.vns.length > 0 && (
        <Section title="Appearances" count={character.vns.length}>
          <CharacterAppearances
            appearances={character.vns}
            seiyuu={character.seiyuu}
            spoiler={spoiler}
          />
        </Section>
      )}

      {hasGroup && (
        <Section title="Instances" count={group.length + (parent ? 1 : 0)}>
          <CharacterInstances
            parent={parent?.character ?? null}
            instances={group}
            currentId={character.id}
            spoiler={spoiler}
          />
        </Section>
      )}
    </DetailShell>
  )
}

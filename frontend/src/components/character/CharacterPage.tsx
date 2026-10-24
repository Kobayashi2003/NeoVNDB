/** The character page, with one spoiler control for everything (sex,
 *  traits, works, instances). Each section still counts what it hides. */
'use client';

import { BBCode } from '@/components/ui/BBCode';
import { byWork, characterSpoilerExtent } from '@/lib/characters';
import { display } from '@/lib/format';
import { cn } from '@/lib/utils';
import { Collapsible } from '@/components/ui/Collapsible';
import { DetailHeader, DetailShell } from '@/components/ui/DetailShell';
import { InfoCard } from '@/components/ui/InfoCard';
import { Section } from '@/components/ui/Section';
import { DetailControls } from '@/components/user/DetailControls';
import { usePrefs } from '@/hooks/usePrefs';
import { useSpoilerLevel } from '@/hooks/useSpoilerLevel';
import { SpoilerScope } from '@/components/ui/Spoiler';
import { CharacterAppearances } from './CharacterAppearances';
import { CharacterInfoPanel } from './CharacterInfoPanel';
import { CharacterInstances } from './CharacterInstances';
import { CharacterTraits } from './CharacterTraits';
import type { CharacterDetail, Instance } from '@/lib/types';

export function CharacterPage({
  character,
  parent,
}: {
  character: CharacterDetail;
  /** The character at the top of the instance group, when this one is not it.
   *  chars.main only points one way, so the siblings come from up there. */
  parent: { character: Instance; instances: Instance[] } | null;
}) {
  const { original, explicit } = usePrefs();
  const extent = characterSpoilerExtent(character, explicit);
  const spoiler = useSpoilerLevel(extent.minor, extent.major);
  const works = byWork(character.vns);

  const group = parent ? parent.instances : character.instances;
  const hasGroup = group.length > 0 || parent !== null;

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
                  className={cn(
                    'shrink-0 text-xs transition-colors coarse:py-1',
                    spoiler.className,
                  )}
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
          <CharacterInfoPanel character={character} spoiler={spoiler} />
        </>
      }
    >
      {character.description && (
        <Section title="Description">
          <InfoCard padding="block">
            <Collapsible>
              <SpoilerScope level={spoiler.level}>
                <BBCode text={character.description} />
              </SpoilerScope>
            </Collapsible>
          </InfoCard>
        </Section>
      )}

      {character.traits.length > 0 && (
        <Section title="Traits" count={character.traits.length}>
          <CharacterTraits traits={character.traits} spoiler={spoiler} />
        </Section>
      )}

      {works.length > 0 && (
        <Section title="Appearances" count={works.length}>
          <CharacterAppearances appearances={works} seiyuu={character.seiyuu} spoiler={spoiler} />
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
  );
}

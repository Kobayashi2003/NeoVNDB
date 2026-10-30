/** The VN page in the browser; VNPage.tsx hands it the data. The expanded
 *  characters view replaces the main column rather than opening a modal over
 *  it. */
'use client';

import { useMemo, useState } from 'react';
import { BBCode } from '@/components/ui/BBCode';
import { unpackTraits, type Packed, type TraitBook } from '@/lib/characters';
import { display } from '@/lib/format';
import { DetailHeader, DetailShell } from '@/components/ui/DetailShell';
import { Collapsible } from '@/components/ui/Collapsible';
import { InfoCard } from '@/components/ui/InfoCard';
import { Section } from '@/components/ui/Section';
import { VNInfoPanel } from './VNInfoPanel';
import { DetailControls } from '@/components/user/DetailControls';
import { usePrefs } from '@/hooks/usePrefs';
import { VNTags } from './VNTags';
import { VNCharacters } from './VNCharacters';
import { VNCharactersPanel } from './VNCharactersPanel';
import { VNStaff } from './VNStaff';
import { VNReleases } from './VNReleases';
import { VNScreenshots } from './VNScreenshots';
import { VNSimilar } from './VNSimilar';
import type { Character, VN } from '@/lib/types';

export type PackedVN = Omit<VN, 'characters'> & { characters: Packed<Character>[] };

export function VNView({ vn, book }: { vn: PackedVN; book: TraitBook }) {
  const { original } = usePrefs();
  const characters = useMemo(() => unpackTraits(vn.characters, book), [vn, book]);
  const [expanded, setExpanded] = useState(false);

  return (
    <DetailShell
      header={
        <DetailHeader
          title={display(vn.title, vn.alttitle, original) || vn.id}
          subtitle={
            vn.alttitle && (
              <p className="mt-1 text-sm text-muted">{display(vn.alttitle, vn.title, original)}</p>
            )
          }
          action={<DetailControls id={vn.id} />}
        />
      }
      aside={
        <>
          <VNInfoPanel vn={vn} />
        </>
      }
    >
      {expanded ? (
        <VNCharactersPanel characters={characters} onClose={() => setExpanded(false)} />
      ) : (
        <>
          {vn.description && (
            <Section title="Description">
              <InfoCard padding="block">
                <Collapsible>
                  <BBCode text={vn.description} />
                </Collapsible>
              </InfoCard>
            </Section>
          )}

          {vn.tags.length > 0 && (
            <Section title="Tags" count={vn.tags.length}>
              <VNTags tags={vn.tags} />
            </Section>
          )}

          {vn.characters.length > 0 && (
            <Section
              title="Characters"
              count={vn.characters.length}
              onTitleClick={() => setExpanded(true)}
            >
              <VNCharacters characters={characters} />
            </Section>
          )}

          {vn.staff.length > 0 && (
            <Section title="Staff" count={vn.staff.length}>
              <VNStaff staff={vn.staff} editions={vn.editions} />
            </Section>
          )}

          {vn.releases.length > 0 && (
            <Section title="Releases" count={vn.releases.length}>
              <VNReleases releases={vn.releases} olang={vn.olang} />
            </Section>
          )}

          {vn.screenshots.length > 0 && (
            <Section title="Screenshots" count={vn.screenshots.length}>
              <VNScreenshots screenshots={vn.screenshots} releases={vn.releases} />
            </Section>
          )}

          {vn.similar.length > 0 && (
            // Not vndb's: works alike in their tags, related ones left out
            // (they are in the sidebar), computed at each import.
            <VNSimilar rows={vn.similar} />
          )}
        </>
      )}
    </DetailShell>
  );
}

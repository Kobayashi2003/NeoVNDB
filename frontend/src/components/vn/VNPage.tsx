/** The VN page. The expanded characters view replaces the main column
 *  rather than opening a modal over it. */
"use client"

import { useMemo, useState } from "react"
import { BBCode } from "@/lib/bbcode"
import { forVN } from "@/lib/characters"
import { display } from "@/lib/format"
import { DetailHeader, DetailShell } from "@/components/ui/DetailShell"
import { Collapsible } from "@/components/ui/Collapsible"
import { InfoCard } from "@/components/ui/InfoCard"
import { Section } from "@/components/ui/Section"
import { VNInfoPanel } from "./VNInfoPanel"
import { DetailControls } from "@/components/ui/DetailControls"
import { usePrefs } from "@/hooks/usePrefs"
import { VNTags } from "./VNTags"
import { VNCharacters } from "./VNCharacters"
import { VNCharactersPanel } from "./VNCharactersPanel"
import { VNStaff } from "./VNStaff"
import { VNReleases } from "./VNReleases"
import { Results } from "@/components/list/Results"
import { VNScreenshots } from "./VNScreenshots"
import type { VN } from "@/lib/types"

export function VNPage({ vn }: { vn: VN }) {
  const { original } = usePrefs()
  const characters = useMemo(() => forVN(vn.characters, vn.id), [vn])
  // null when the expanded characters view is closed; otherwise the character
  // to open it on, which is itself null when opened from the heading.
  const [expanded, setExpanded] = useState<{ focus: string | null } | null>(null)

  return (
    <DetailShell
      header={
        <DetailHeader
          title={display(vn.title, vn.alttitle, original) || vn.id}
          subtitle={
            vn.alttitle && (
              <p className="mt-1 text-sm text-muted">
                {display(vn.alttitle, vn.title, original)}
              </p>
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
        <VNCharactersPanel
          characters={characters}
          focusId={expanded.focus}
          onClose={() => setExpanded(null)}
        />
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
              onTitleClick={() => setExpanded({ focus: null })}
            >
              <VNCharacters
                characters={characters}
                onExpand={(focus) => setExpanded({ focus })}
              />
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
            <Section title="Similar" count={vn.similar.length}>
              <Results type="v" rows={vn.similar} />
            </Section>
          )}
        </>
      )}
    </DetailShell>
  )
}

/** The release page.
 *
 *  The works come first and always: a release has no subject of its own, it is
 *  a packaging of these, and half of all releases carry no notes, no pictures,
 *  no second title and no DRM -- nothing else would be left to show.
 *
 *  No spoiler control. Nothing the dump records about a release is withheld
 *  from a reader who has not finished the work; the content levels still
 *  apply, because a package scan can be as explicit as anything inside. */
"use client"

import { BBCode } from "@/lib/bbcode"
import { ICON } from "@/lib/icons"
import { enumLabel } from "@/lib/enums"
import { display } from "@/lib/format"
import { Collapsible } from "@/components/ui/Collapsible"
import { DetailHeader, DetailShell } from "@/components/ui/DetailShell"
import { Icon } from "@/components/ui/Icon"
import { InfoCard } from "@/components/ui/InfoCard"
import { ContentLevels } from "@/components/ui/PrefsControls"
import { DetailControls } from "@/components/ui/DetailControls"
import { Section } from "@/components/ui/Section"
import { usePrefs } from "@/hooks/usePrefs"
import { ReleaseDRM } from "./ReleaseDRM"
import { ReleaseImages } from "./ReleaseImages"
import { ReleaseInfoPanel } from "./ReleaseInfoPanel"
import { ReleaseTitles } from "./ReleaseTitles"
import { ReleaseVNs } from "./ReleaseVNs"
import type { ReleaseDetail } from "@/lib/types"

const LANG = ICON.LANGUAGE as Record<string, string>

export function ReleasePage({ release: r }: { release: ReleaseDetail }) {
  const { original } = usePrefs()

  return (
    <DetailShell
      header={
        <DetailHeader
          title={
            <span className="flex items-baseline gap-2">
              {LANG[r.olang] && (
                <Icon cls={LANG[r.olang]} title={enumLabel("LANGUAGE", r.olang)} />
              )}
              <span className="min-w-0">{display(r.title, r.alttitle, original) || r.id}</span>
            </span>
          }
          subtitle={
            r.alttitle && (
              <p className="mt-1 text-sm text-muted">{display(r.alttitle, r.title, original)}</p>
            )
          }
          action={<DetailControls id={r.id} />}
        />
      }
      aside={
        <>
          <ContentLevels className="flex-col items-stretch" />
          <ReleaseInfoPanel release={r} />
        </>
      }
    >
      {r.vns.length > 0 && (
        <Section title="Visual Novels" count={r.vns.length}>
          <ReleaseVNs vns={r.vns} />
        </Section>
      )}

      {r.notes && (
        <Section title="Notes">
          <InfoCard padding="block">
            <Collapsible>
              <BBCode text={r.notes} />
            </Collapsible>
          </InfoCard>
        </Section>
      )}

      {/* One title is the heading; more than one is a fact about the release. */}
      {r.titles.length > 1 && (
        <Section title="Titles" count={r.titles.length}>
          <ReleaseTitles titles={r.titles} olang={r.olang} />
        </Section>
      )}

      {r.images.length > 0 && (
        <Section title="Images" count={r.images.length}>
          <ReleaseImages images={r.images} />
        </Section>
      )}

      {r.drm.length > 0 && (
        <Section title="DRM" count={r.drm.length}>
          <ReleaseDRM drm={r.drm} />
        </Section>
      )}
    </DetailShell>
  )
}

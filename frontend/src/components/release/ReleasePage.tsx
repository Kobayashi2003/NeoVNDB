/** The release page, led by the works it contains. No spoiler control:
 *  nothing about a release is spoiler-gated, but content levels still apply to
 *  its images. */
"use client"

import { BBCode } from "@/lib/bbcode"
import { iconOf } from "@/lib/icons"
import { enumLabel } from "@/lib/enums"
import { display } from "@/lib/format"
import { Collapsible } from "@/components/ui/Collapsible"
import { DetailHeader, DetailShell } from "@/components/ui/DetailShell"
import { Icon } from "@/components/ui/Icon"
import { InfoCard } from "@/components/ui/InfoCard"
import { DetailControls } from "@/components/ui/DetailControls"
import { Section } from "@/components/ui/Section"
import { usePrefs } from "@/hooks/usePrefs"
import { ReleaseDRM } from "./ReleaseDRM"
import { ReleaseImages } from "./ReleaseImages"
import { ReleaseInfoPanel } from "./ReleaseInfoPanel"
import { ReleaseTitles } from "./ReleaseTitles"
import { ReleaseVNs } from "./ReleaseVNs"
import type { ReleaseDetail } from "@/lib/types"

export function ReleasePage({ release: r }: { release: ReleaseDetail }) {
  const { original } = usePrefs()

  return (
    <DetailShell
      header={
        <DetailHeader
          title={
            <span className="flex items-baseline gap-2">
              {iconOf("LANGUAGE", r.olang) && (
                <Icon cls={iconOf("LANGUAGE", r.olang)} title={enumLabel("LANGUAGE", r.olang)} />
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

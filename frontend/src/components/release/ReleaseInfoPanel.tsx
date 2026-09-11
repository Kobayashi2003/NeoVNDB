/** The release sidebar: what shape the thing was published in, then the ways
 *  out of the page. A release has no cover of its own -- the pictures it has
 *  are of the package, and those belong in the body where they can be seen. */
"use client"

import Link from "next/link"
import { ICON } from "@/lib/icons"
import { enumLabel } from "@/lib/enums"
import { animationLabel, medium, releaseDate } from "@/lib/format"
import { AgeRating } from "@/components/ui/AgeRating"
import { Icon } from "@/components/ui/Icon"
import { InfoCard, InfoRow, InlineList, TitledCard } from "@/components/ui/InfoCard"
import { Tooltip } from "@/components/ui/Tooltip"
import type { ReleaseDetail } from "@/lib/types"

const LANG = ICON.LANGUAGE as Record<string, string>
const PLAT = ICON.PLATFORM as Record<string, string>

/** Three independent facts vndb records about how a release was published. */
function publication(r: ReleaseDetail): string[] {
  return [
    r.official ? "Official" : "Unofficial",
    r.patch ? "Patch" : null,
    r.freeware ? "Freeware" : null,
  ].filter((x): x is string => x !== null)
}

/** The animation record read as a sentence. vndb stores story scenes and ero
 *  scenes separately, plus two flags about the whole release. */
function animation(r: ReleaseDetail): string[] {
  const out: string[] = []
  const story = animationLabel(r.animation?.story?.sprites ?? r.animation?.story?.cg ?? null)
  const ero = r.has_ero
    ? animationLabel(r.animation?.ero?.sprites ?? r.animation?.ero?.cg ?? null)
    : null
  const cutscene = animationLabel(r.animation?.cutscene ?? null)
  if (story) out.push(`Story: ${story}`)
  if (ero) out.push(`Ero: ${ero}`)
  if (cutscene) out.push(`Cutscenes: ${cutscene}`)
  if (r.animation?.background) out.push("Animated backgrounds")
  if (r.animation?.face) out.push("Animated faces")
  return out
}

export function ReleaseInfoPanel({ release: r }: { release: ReleaseDetail }) {
  const animated = animation(r)

  return (
    <>
      <InfoCard>
        <InfoRow label="Released">{releaseDate(r.released)}</InfoRow>

        <InfoRow label="Age rating">
          <AgeRating minage={r.minage} uncensored={r.uncensored ?? false} />
          {r.has_ero && (
            <Tooltip label="Contains erotic scenes">
              <span className="text-rose-400">&hearts;</span>
            </Tooltip>
          )}
        </InfoRow>

        <InfoRow label="Publication">{publication(r).join(", ")}</InfoRow>

        {r.platforms.length > 0 && (
          <InfoRow label="Platform">
            {r.platforms.map((p) => (
              <Icon key={p} cls={PLAT[p] ?? ""} title={enumLabel("PLATFORM", p)} />
            ))}
          </InfoRow>
        )}

        {r.media.length > 0 && (
          <InfoRow label="Media">
            <InlineList items={r.media.map((m) => medium(m))} />
          </InfoRow>
        )}

        {r.resolution && <InfoRow label="Resolution">{r.resolution}</InfoRow>}
        {r.engine && <InfoRow label="Engine">{r.engine.name}</InfoRow>}
        {r.voiced !== null && (
          <InfoRow label="Voiced">{enumLabel("VOICED", r.voiced)}</InfoRow>
        )}

        {animated.length > 0 && (
          <InfoRow label="Animation">
            <span className="flex flex-col gap-0.5">
              {animated.map((line) => (
                <span key={line}>{line}</span>
              ))}
            </span>
          </InfoRow>
        )}

        {r.catalog && <InfoRow label="Catalogue">{r.catalog}</InfoRow>}
        {/* Wider than a JSON consumer should do arithmetic on, so the API
            hands it over as a string and it is shown as one. */}
        {r.gtin && <InfoRow label="GTIN">{r.gtin}</InfoRow>}
      </InfoCard>

      {r.producers.length > 0 && (
        <TitledCard title="Producers">
          <div className="flex flex-col gap-1 text-xs">
            {r.producers.map((p) => (
              <Link
                key={p.id}
                href={`/${p.id}`}
                className="flex items-center gap-1.5 transition-colors hover:text-accent"
              >
                {p.lang && LANG[p.lang] && (
                  <Icon cls={LANG[p.lang]} title={enumLabel("LANGUAGE", p.lang)} />
                )}
                <span className="truncate">{p.name}</span>
                <span className="shrink-0 text-muted">
                  {p.developer && p.publisher
                    ? "(dev, pub)"
                    : p.developer
                      ? "(dev)"
                      : p.publisher
                        ? "(pub)"
                        : ""}
                </span>
              </Link>
            ))}
          </div>
        </TitledCard>
      )}

      {r.supersedes.length > 0 && (
        <TitledCard title="Supersedes">
          <div className="flex flex-col gap-0.5 text-xs">
            {r.supersedes.map((s) => (
              <Link key={s.id} href={`/${s.id}`} className="truncate text-white/80 hover:text-accent">
                {s.title}
              </Link>
            ))}
          </div>
        </TitledCard>
      )}

      {r.extlinks.length > 0 && (
        <TitledCard title="Links">
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
            {r.extlinks.map((l, i) => (
              <a
                key={`${l.site}-${i}`}
                href={l.url}
                rel="noreferrer noopener"
                className="text-white/90 hover:text-accent"
              >
                {l.label}
              </a>
            ))}
          </div>
        </TitledCard>
      )}
    </>
  )
}

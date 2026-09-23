/** The sidebar: the cover, then the facts that belong beside it.
 *
 *  The rating leads and stays blurred until asked for. A score is the one
 *  thing on this page that changes how a reader reads everything below it,
 *  and a reader who wants to decide for themselves cannot unsee it. */
"use client"

import { useState } from "react"
import Link from "next/link"
import { Eye, EyeOff, Share2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { ICON } from "@/lib/icons"
import { enumLabel } from "@/lib/enums"
import { shouldBlur } from "@/lib/content"
import { publishers } from "@/lib/vn"
import { display, length, releaseDate, score } from "@/lib/format"
import { Cover } from "@/components/ui/Cover"
import { Icon } from "@/components/ui/Icon"
import { InfoCard, InfoRow, InlineList, TitledCard } from "@/components/ui/InfoCard"
import { VNRelations } from "./VNRelations"
import { usePrefs } from "@/hooks/usePrefs"
import type { VN } from "@/lib/types"

const LANG = ICON.LANGUAGE as Record<string, string>
const PLAT = ICON.PLATFORM as Record<string, string>

/** Finished, in development, or cancelled -- coloured because the middle one
 *  and the last one mean very different things to a reader deciding to start. */
const DEVSTATUS_CLASS: Record<number, string> = {
  0: "bg-green-500/20 text-green-400",
  1: "bg-yellow-500/20 text-yellow-400",
  2: "bg-red-500/20 text-red-400",
}

export function VNInfoPanel({ vn }: { vn: VN }) {
  const { original, sexual, violence } = usePrefs()
  const blur = !!vn.image && shouldBlur(vn.image.sexual, vn.image.violence, sexual, violence)
  const published = publishers(vn.releases)

  return (
    <>
      {/* Stacked below lg the cover sits beside the facts rather than above
          them: full width on a phone it is most of a screen before a reader
          learns anything. In the sidebar there is room for it to lead. */}
      <div className="flex gap-3 lg:flex-col">
        {vn.image && (
          <Cover
            image={vn.image}
            alt={vn.title ?? ""}
            blurred={blur}
            className="w-32 shrink-0 self-start border border-white/5 sm:w-40 lg:w-full"
          />
        )}

        <InfoCard className="min-w-0 flex-1 lg:flex-none">
          <InfoRow label="Rating">
            <Rating value={vn.rating} votes={vn.votecount} />
          </InfoRow>

          <InfoRow label="Status">
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-xs font-medium",
                DEVSTATUS_CLASS[vn.devstatus] ?? "bg-white/10 text-white/60",
              )}
            >
              {enumLabel("DEVSTATUS", vn.devstatus)}
            </span>
          </InfoRow>

          <InfoRow label="Released">{releaseDate(vn.released)}</InfoRow>

          <InfoRow label="Length">{length(vn.length, vn.length_minutes, vn.length_votes)}</InfoRow>

          <InfoRow label="Platform">
            {vn.platforms.map((p) => (
              <Icon key={p} cls={PLAT[p] ?? ""} title={enumLabel("PLATFORM", p)} />
            ))}
          </InfoRow>

          <InfoRow label="Language">
            {vn.languages.map((l) => (
              <Icon
                key={l}
                cls={LANG[l] ?? ""}
                title={l === vn.olang ? `${enumLabel("LANGUAGE", l)} (original)` : enumLabel("LANGUAGE", l)}
                className={cn(l === vn.olang && "rounded-xs ring-1 ring-accent")}
              />
            ))}
          </InfoRow>

          {vn.developers.length > 0 && (
            <InfoRow label="Developer">
              <InlineList
                items={vn.developers.map((d) => (
                  <Link key={d.id} href={`/${d.id}`} className="hover:text-accent">
                    {d.name}
                  </Link>
                ))}
              />
            </InfoRow>
          )}

          {published.length > 0 && (
            <InfoRow label="Publisher">
              <div className="flex w-full flex-col gap-1">
                {published.map((p) => (
                  <Link
                    key={p.id}
                    href={`/${p.id}`}
                    className="flex items-center gap-1.5 transition-colors hover:text-accent"
                  >
                    {p.lang && LANG[p.lang] && (
                      <Icon cls={LANG[p.lang]} title={enumLabel("LANGUAGE", p.lang)} />
                    )}
                    <span className="truncate">{p.name}</span>
                  </Link>
                ))}
              </div>
            </InfoRow>
          )}

          {vn.aliases.length > 0 && (
            <InfoRow label="Aliases">
              <span className="text-muted">{vn.aliases.join(", ")}</span>
            </InfoRow>
          )}
        </InfoCard>
      </div>

      {vn.relations.length > 0 && (
        <TitledCard
          title="Relations"
          action={
            <Link
              href={`/${vn.id}/rg`}
              className="flex items-center gap-1 text-xs text-muted transition-colors hover:text-accent"
            >
              <Share2 className="icon-text h-3 w-3" aria-hidden />
              Graph
            </Link>
          }
        >
          <VNRelations relations={vn.relations} />
        </TitledCard>
      )}

      {vn.anime.length > 0 && (
        <TitledCard title="Anime">
          {/* Not links: an anime is not a thing this database holds, so there
              is nowhere here to send a reader who clicks one. */}
          <ul className="flex flex-col gap-1 text-xs">
            {vn.anime.map((a) => (
              <li key={a.id} className="flex items-baseline gap-2">
                <span className="min-w-0 flex-1 text-white/90">
                  {display(a.title, a.original, original)}
                </span>
                <span className="shrink-0 text-muted">
                  {a.type && enumLabel("ANIME_TYPE", a.type)}
                  {a.type && a.year ? " " : ""}
                  {a.year ?? ""}
                </span>
              </li>
            ))}
          </ul>
        </TitledCard>
      )}

      {vn.extlinks.length > 0 && (
        <TitledCard title="Links">
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
            {vn.extlinks.map((l, i) => (
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

function Rating({ value, votes }: { value: number | null; votes: number }) {
  const [hidden, setHidden] = useState(true)

  return (
    // Wrapping, because beside the cover on a phone this column is about
    // 114px and "84.50 / 100 (8,726)" with a button after it is not.
    <span className="flex w-full flex-wrap items-center gap-1.5">
      {value === null ? (
        <span className="text-muted">No rating</span>
      ) : (
        <>
          <span className={cn("font-semibold text-accent transition-all", hidden && "select-none blur-sm")}>
            {score(value)}
          </span>
          <span className="text-muted">/ 100</span>
          {votes > 0 && (
            <span className={cn("text-muted transition-all", hidden && "select-none blur-sm")}>
              ({votes.toLocaleString()})
            </span>
          )}
        </>
      )}
      <button
        onClick={() => setHidden((on) => !on)}
        title={hidden ? "Show rating" : "Hide rating"}
        aria-label={hidden ? "Show rating" : "Hide rating"}
        className="icon-text ml-auto rounded p-0.5 text-muted transition-colors hover:text-white"
      >
        {hidden ? <Eye className="h-3.5 w-3.5" aria-hidden /> : <EyeOff className="h-3.5 w-3.5" aria-hidden />}
      </button>
    </span>
  )
}

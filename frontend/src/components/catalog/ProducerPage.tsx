/** A company, and what it put its name on.
 *
 *  Two tabs, because the dump distinguishes two things a company can be to a
 *  work. `developer` is who made it; `producer` is who made or published it,
 *  which is the wider question and the one a reader usually means by "their
 *  games". Releases are the third: a publisher's catalogue often reads as a
 *  list of editions rather than of works. */

import Link from "next/link"
import { ICON } from "@/lib/icons"
import { enumLabel } from "@/lib/enums"
import { BBCode } from "@/lib/bbcode"
import type { Params } from "@/lib/href"
import { countOf } from "@/lib/results"
import { Collapsible } from "@/components/ui/Collapsible"
import { Icon } from "@/components/ui/Icon"
import { InfoCard, InfoRow, TitledCard } from "@/components/ui/InfoCard"
import { Name } from "@/components/ui/Name"
import { CatalogPage } from "./CatalogPage"
import type { ProducerDetail } from "@/lib/types"

const LANG = ICON.LANGUAGE as Record<string, string>

type Relation = ProducerDetail["relations"][number]

function groupBy(relations: Relation[]): Map<string, Relation[]> {
  const groups = new Map<string, Relation[]>()
  for (const r of relations) {
    groups.set(r.relation, [...(groups.get(r.relation) ?? []), r])
  }
  return groups
}

export async function ProducerPage({
  producer: p,
  params,
}: {
  producer: ProducerDetail
  params: Params
}) {
  const path = `/${p.id}`
  const [developed, involved, released] = await Promise.all([
    countOf("v", { developer: p.id }),
    countOf("v", { producer: p.id }),
    countOf("r", { producer: p.id }),
  ])

  return (
    <CatalogPage
      title={<Name name={p.name} original={p.original} fallback={p.id} />}
      subtitle={p.original && <p className="mt-1 text-sm text-muted">{p.original}</p>}
      path={path}
      params={params}
      empty="No works are credited to this producer."
      tabs={[
        { value: "developed", label: "Developed", count: developed, type: "v", filters: { developer: p.id } },
        { value: "involved", label: "Developed or published", count: involved, type: "v", filters: { producer: p.id } },
        { value: "releases", label: "Releases", count: released, type: "r", filters: { producer: p.id } },
      ]}
      aside={
        <>
          <InfoCard>
            <InfoRow label="Type">{enumLabel("TYPE", p.type)}</InfoRow>
            <InfoRow label="Language">
              <Icon cls={LANG[p.lang] ?? ""} title={enumLabel("LANGUAGE", p.lang)} />
              <span>{enumLabel("LANGUAGE", p.lang)}</span>
            </InfoRow>
            {p.aliases.length > 0 && (
              <InfoRow label="Aliases">
                <span className="text-muted">{p.aliases.join(", ")}</span>
              </InfoRow>
            )}
          </InfoCard>

          {p.description && (
            <TitledCard title="About">
              <Collapsible>
                <BBCode text={p.description} />
              </Collapsible>
            </TitledCard>
          )}

          {p.relations.length > 0 && (
            <TitledCard title="Related producers">
              <div className="flex flex-col gap-2 text-xs">
                {/* Grouped, so a company with three imprints says "Imprint"
                    once rather than three times. */}
                {[...groupBy(p.relations).entries()].map(([relation, list]) => (
                  <div key={relation}>
                    <p className="mb-1 text-muted">
                      {enumLabel("PRODUCER_RELATION", relation)}
                    </p>
                    <div className="flex flex-col gap-0.5">
                      {list.map((r) => (
                        <Link
                          key={r.id}
                          href={`/${r.id}`}
                          className="truncate text-white/90 hover:text-accent"
                        >
                          <Name name={r.name} original={r.original} />
                        </Link>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </TitledCard>
          )}

          {p.extlinks.length > 0 && (
            <TitledCard title="Links">
              <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
                {p.extlinks.map((l, i) => (
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
      }
    />
  )
}

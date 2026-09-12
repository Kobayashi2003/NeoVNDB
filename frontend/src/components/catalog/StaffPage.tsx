/** A person, and what they worked on.
 *
 *  Two tabs for the two kinds of credit the dump keeps apart: the works they
 *  are credited on in any role, and the works they voiced a character in. They
 *  are separate tables upstream and they answer different questions, so they
 *  stay separate here.
 *
 *  The aliases are worth a card of their own. A credit elsewhere points at an
 *  alias, not at the person, so a reader who arrived from a staff line saw a
 *  pen name and needs to find it in the list to know they are in the right
 *  place -- the person's own name is marked, and the rest are what else they
 *  have signed. */

import { ICON } from "@/lib/icons"
import { enumLabel } from "@/lib/enums"
import { BBCode } from "@/lib/bbcode"
import { cn } from "@/lib/utils"
import type { Params } from "@/lib/href"
import { countOf } from "@/lib/results"
import { Collapsible } from "@/components/ui/Collapsible"
import { Icon } from "@/components/ui/Icon"
import { InfoCard, InfoRow, TitledCard } from "@/components/ui/InfoCard"
import { Name } from "@/components/ui/Name"
import { CatalogPage } from "./CatalogPage"
import type { StaffDetail } from "@/lib/types"

const LANG = ICON.LANGUAGE as Record<string, string>
const SEX = ICON.CHARACTER_SEX as Record<string, string>

export async function StaffPage({
  staff: s,
  params,
}: {
  staff: StaffDetail
  params: Params
}) {
  const path = `/${s.id}`
  const [credited, voiced] = await Promise.all([
    countOf("v", { staff: s.id }),
    countOf("v", { seiyuu: s.id }),
  ])

  return (
    <CatalogPage
      title={<Name name={s.name} original={s.original} fallback={s.id} />}
      subtitle={s.original && <p className="mt-1 text-sm text-muted">{s.original}</p>}
      path={path}
      params={params}
      empty="No works are credited to this person."
      tabs={[
        { value: "credited", label: "Credited on", count: credited, type: "v", filters: { staff: s.id } },
        { value: "voiced", label: "Voice roles", count: voiced, type: "v", filters: { seiyuu: s.id } },
      ]}
      aside={
        <>
          <InfoCard>
            <InfoRow label="Language">
              <Icon cls={LANG[s.lang] ?? ""} title={enumLabel("LANGUAGE", s.lang)} />
              <span>{enumLabel("LANGUAGE", s.lang)}</span>
            </InfoRow>
            {s.gender && (
              <InfoRow label="Gender">
                <Icon cls={SEX[s.gender] ?? ""} title={enumLabel("CHARACTER_SEX", s.gender)} />
                <span>{enumLabel("CHARACTER_SEX", s.gender)}</span>
              </InfoRow>
            )}
          </InfoCard>

          {s.description && (
            <TitledCard title="About">
              <Collapsible>
                <BBCode text={s.description} />
              </Collapsible>
            </TitledCard>
          )}

          {s.aliases.length > 1 && (
            <TitledCard title="Names">
              <div className="flex flex-col gap-1 text-xs">
                {s.aliases.map((a) => (
                  <span
                    key={a.aid}
                    className={cn("truncate", a.ismain ? "text-white/90" : "text-muted")}
                  >
                    <Name name={a.name} original={a.original} />
                    {a.ismain && <span className="ml-1.5 text-muted">(own name)</span>}
                  </span>
                ))}
              </div>
            </TitledCard>
          )}

          {s.extlinks.length > 0 && (
            <TitledCard title="Links">
              <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
                {s.extlinks.map((l, i) => (
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

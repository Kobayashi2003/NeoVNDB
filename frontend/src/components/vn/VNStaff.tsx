"use client"

/** Staff by role, and before that by edition.
 *
 *  A credit can belong to a named version of the work rather than to the work
 *  itself -- a port, a premium edition, somebody's translation -- and the two
 *  are different facts: who wrote the game is not who translated it. So the
 *  ones with no edition come first, under no heading because they are simply
 *  the work, and the rest sit under the version they are for.
 *
 *  Most works have no such credits at all, and then this is one plain list and
 *  no headings, which is what it was before.
 *
 *  The name shown is the one credited on this work, which for a pen name is
 *  not the person's own -- the API hands back the credited alias. */

import Link from "next/link"
import { cn } from "@/lib/utils"
import { ICON } from "@/lib/icons"
import { enumLabel } from "@/lib/enums"
import { display } from "@/lib/format"
import { Icon } from "@/components/ui/Icon"
import { usePrefs } from "@/hooks/usePrefs"
import type { Edition, StaffCredit } from "@/lib/types"

const LANG = ICON.LANGUAGE as Record<string, string>

/** The credits in the order they should be read: the work, then each edition
 *  that has any, in the order the dump numbers them.
 *
 *  Nothing is allowed to fall out. A credit naming an edition that is not in
 *  the list would otherwise vanish from the page, and the two tables have no
 *  key tying them together -- today every credit matches, but the mirror is
 *  rebuilt from upstream every week and this page should not be the thing that
 *  notices when one stops. Such a credit gets its edition number instead of a
 *  name, which is all that is known about it. */
function grouped(staff: StaffCredit[], editions: Edition[]) {
  const base = staff.filter((c) => c.eid === null)
  const known = new Set(editions.map((e) => e.eid))

  const rest = editions
    .map((edition) => ({ edition, credits: staff.filter((c) => c.eid === edition.eid) }))
    .filter((g) => g.credits.length > 0)

  const strays = [...new Set(staff.map((c) => c.eid))]
    .filter((eid): eid is number => eid !== null && !known.has(eid))
    .sort((a, b) => a - b)
    .map((eid) => ({
      edition: { eid, name: `Edition ${eid}`, lang: null, official: true } satisfies Edition,
      credits: staff.filter((c) => c.eid === eid),
    }))

  return { base, rest: [...rest, ...strays] }
}

function byRole(credits: StaffCredit[]): [string, StaffCredit[]][] {
  const roles = new Map<string, StaffCredit[]>()
  for (const credit of credits) {
    const list = roles.get(credit.role) ?? []
    list.push(credit)
    roles.set(credit.role, list)
  }
  return [...roles.entries()]
}

export function VNStaff({ staff, editions }: { staff: StaffCredit[]; editions: Edition[] }) {
  const { base, rest } = grouped(staff, editions)

  return (
    <div className="flex flex-col gap-3">
      {base.length > 0 && <Credits credits={base} />}
      {rest.map(({ edition, credits }) => (
        <div key={edition.eid} className="flex flex-col gap-1">
          <p className="flex items-center gap-1.5 px-1 text-xs font-semibold text-muted">
            {edition.lang && LANG[edition.lang] && (
              <Icon
                cls={LANG[edition.lang]}
                title={enumLabel("LANGUAGE", edition.lang)}
                className="shrink-0"
              />
            )}
            <span className="min-w-0 truncate">{edition.name}</span>
            {!edition.official && (
              <span className="shrink-0 rounded bg-white/10 px-1.5 py-0.5 text-[0.625rem] font-medium">
                Unofficial
              </span>
            )}
          </p>
          <Credits credits={credits} />
        </div>
      ))}
    </div>
  )
}

function Credits({ credits, className }: { credits: StaffCredit[]; className?: string }) {
  const { original } = usePrefs()

  return (
    <dl className={cn("rounded-lg border border-white/5 bg-surface px-3 py-1", className)}>
      {byRole(credits).map(([role, list]) => (
        <div
          key={role}
          className="flex flex-col gap-0.5 border-b border-white/5 py-1.5 last:border-0 sm:flex-row sm:gap-2"
        >
          <dt className="shrink-0 pt-0.5 text-xs text-muted sm:w-28">
            {enumLabel("STAFF_ROLE", role)}
          </dt>
          <dd className="min-w-0 flex-1 text-xs text-white/90">
            {list.map((c, i) => (
              <span key={`${c.id}-${i}`}>
                {i > 0 && ", "}
                <Link href={`/${c.id}`} className="hover:text-accent">
                  {display(c.name, c.original, original)}
                </Link>
                {c.note && <span className="text-muted"> ({c.note})</span>}
              </span>
            ))}
          </dd>
        </div>
      ))}
    </dl>
  )
}

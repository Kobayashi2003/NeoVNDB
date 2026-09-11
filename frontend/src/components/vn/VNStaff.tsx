"use client"

/** Staff by role. The name shown is the one credited on this work, which for
 *  a pen name is not the person's own -- the API hands back the credited alias. */

import Link from "next/link"
import { enumLabel } from "@/lib/enums"
import { display } from "@/lib/format"
import { usePrefs } from "@/hooks/usePrefs"
import type { StaffCredit } from "@/lib/types"

export function VNStaff({ staff }: { staff: StaffCredit[] }) {
  const { original } = usePrefs()
  const roles = new Map<string, StaffCredit[]>()
  for (const credit of staff) {
    const list = roles.get(credit.role) ?? []
    list.push(credit)
    roles.set(credit.role, list)
  }

  return (
    <dl className="rounded-lg border border-white/5 bg-surface px-3 py-1">
      {[...roles.entries()].map(([role, credits]) => (
        <div key={role} className="flex flex-col gap-0.5 border-b border-white/5 py-1.5 last:border-0 sm:flex-row sm:gap-2">
          <dt className="shrink-0 pt-0.5 text-xs text-muted sm:w-28">
            {enumLabel("STAFF_ROLE", role)}
          </dt>
          <dd className="min-w-0 flex-1 text-xs text-white/90">
            {credits.map((c, i) => (
              <span key={`${c.id}-${i}`}>
                {i > 0 && ", "}
                <Link href={`/s/${c.id}`} className="hover:text-accent">
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

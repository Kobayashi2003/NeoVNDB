/** Related visual novels, grouped by how they relate.
 *
 *  A sidebar card rather than a body section: it is a way out of this page,
 *  and a reader looks for those beside the work rather than inside it.
 *  Unofficial relations are dimmed the way unofficial releases are, so the two
 *  senses of "not from the original team" read alike across the page. */

import Link from "next/link"
import { cn } from "@/lib/utils"
import { VN_RELATION } from "@/lib/enums"
import type { Relation } from "@/lib/types"

export function VNRelations({ relations }: { relations: Relation[] }) {
  const groups = new Map<string, Relation[]>()
  for (const r of relations) {
    groups.set(r.relation, [...(groups.get(r.relation) ?? []), r])
  }

  return (
    <div className="flex flex-col gap-2">
      {[...groups.entries()].map(([relation, list]) => (
        <div key={relation}>
          <p className="mb-1 text-xs text-muted">{VN_RELATION[relation] ?? relation}</p>
          <div className="flex flex-col gap-0.5">
            {list.map((r) => (
              <Link
                key={r.id}
                href={`/v/${r.id}`}
                title={r.official ? undefined : "Unofficial relation"}
                className={cn(
                  "truncate text-xs text-white/80 transition-colors hover:text-accent",
                  !r.official && "opacity-60",
                )}
              >
                {r.title}
              </Link>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

/** The results themselves, laid out the way their type is looked at.
 *
 *  Kept apart from the page shell so the shell stays type-agnostic: it knows
 *  about counts, orders and pages, and nothing about what a producer looks
 *  like. */
"use client"

import {
  CharacterCard, ProducerCard, ReleaseCard, StaffCard, TagCard, TraitCard, VNCard,
} from "./ResultCards"
import type {
  CharacterRow, ProducerRow, ReleaseRow, StaffRow, TagRow, TraitRow, VNRow,
} from "@/lib/types"

const GRID = "grid grid-cols-2 items-stretch gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6"
const LIST = "rounded-lg border border-white/5 bg-surface"

export function Results({ type, rows }: { type: string; rows: unknown[] }) {
  switch (type) {
    case "v":
      return (
        <div className={GRID}>
          {(rows as VNRow[]).map((r) => (
            <VNCard key={r.id} row={r} />
          ))}
        </div>
      )
    case "c":
      return (
        <div className={GRID}>
          {(rows as CharacterRow[]).map((r) => (
            <CharacterCard key={r.id} row={r} />
          ))}
        </div>
      )
    case "r":
      return (
        <div className={LIST}>
          {(rows as ReleaseRow[]).map((r) => (
            <ReleaseCard key={r.id} row={r} />
          ))}
        </div>
      )
    case "p":
      return (
        <div className={LIST}>
          {(rows as ProducerRow[]).map((r) => (
            <ProducerCard key={r.id} row={r} />
          ))}
        </div>
      )
    case "s":
      return (
        <div className={LIST}>
          {(rows as StaffRow[]).map((r) => (
            <StaffCard key={r.id} row={r} />
          ))}
        </div>
      )
    case "g":
      return (
        <div className={LIST}>
          {(rows as TagRow[]).map((r) => (
            <TagCard key={r.id} row={r} />
          ))}
        </div>
      )
    case "i":
      return (
        <div className={LIST}>
          {(rows as TraitRow[]).map((r) => (
            <TraitCard key={r.id} row={r} />
          ))}
        </div>
      )
    default:
      return null
  }
}

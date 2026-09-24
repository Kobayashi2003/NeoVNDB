/** Results laid out for their type. Card building and arrangement are
 *  separate so a caller can wrap each card (collections add a checkbox). */
"use client"

import { Fragment } from "react"
import {
  CharacterCard, ProducerCard, ReleaseCard, StaffCard, TagCard, TraitCard, VNCard,
} from "./ResultCards"
import type {
  CharacterRow, ProducerRow, ReleaseRow, StaffRow, TagRow, TraitRow, VNRow,
} from "@/lib/types"

const GRID = "grid grid-cols-2 items-stretch gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7"
const LIST = "rounded-lg border border-white/5 bg-surface"

/** Pictures are looked for by eye and go in a grid; the rest are looked for by
 *  name, and a grid of identical text boxes is harder to scan than rows. */
function build(type: string, rows: unknown[]): { layout: string; cards: Card[] } | null {
  switch (type) {
    case "v":
      return { layout: GRID, cards: (rows as VNRow[]).map((r) => ({ id: r.id, node: <VNCard row={r} />, grid: true })) }
    case "c":
      return { layout: GRID, cards: (rows as CharacterRow[]).map((r) => ({ id: r.id, node: <CharacterCard row={r} />, grid: true })) }
    case "r":
      return { layout: LIST, cards: (rows as ReleaseRow[]).map((r) => ({ id: r.id, node: <ReleaseCard row={r} />, grid: false })) }
    case "p":
      return { layout: LIST, cards: (rows as ProducerRow[]).map((r) => ({ id: r.id, node: <ProducerCard row={r} />, grid: false })) }
    case "s":
      return { layout: LIST, cards: (rows as StaffRow[]).map((r) => ({ id: r.id, node: <StaffCard row={r} />, grid: false })) }
    case "g":
      return { layout: LIST, cards: (rows as TagRow[]).map((r) => ({ id: r.id, node: <TagCard row={r} />, grid: false })) }
    case "i":
      return { layout: LIST, cards: (rows as TraitRow[]).map((r) => ({ id: r.id, node: <TraitCard row={r} />, grid: false })) }
    default:
      return null
  }
}

interface Card {
  id: string
  node: React.ReactNode
  /** A tile in a grid, rather than a row in a stack. Whatever a caller puts
   *  around a card has to go somewhere different in the two: a tile has a
   *  picture to sit on top of, a row has its own leading icon already. */
  grid: boolean
}

export function Results({
  type,
  rows,
  wrap,
}: {
  type: string
  rows: unknown[]
  /** Put something around each card. */
  wrap?: (card: Card) => React.ReactNode
}) {
  const built = build(type, rows)
  if (!built) return null

  return (
    <div className={built.layout}>
      {built.cards.map((card) => (
        // A fragment rather than a wrapper element: the card has to stay a
        // direct child of the grid or the layout is not a grid any more.
        <Fragment key={card.id}>{wrap ? wrap(card) : card.node}</Fragment>
      ))}
    </div>
  )
}

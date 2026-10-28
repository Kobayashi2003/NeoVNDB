/** Results laid out for their type. Card building and arrangement are
 *  separate so a caller can wrap each card (collections add a checkbox);
 *  inside a selecting Collecting, cards become checkboxes on their own. */
'use client';

import { Fragment, useEffect } from 'react';
import {
  CharacterCard,
  COVER,
  GoneCard,
  PORTRAIT,
  ProducerCard,
  ReleaseCard,
  StaffCard,
  TagCard,
  TraitCard,
  VNCard,
} from './ResultCards';
import {
  isGone,
  type CharacterRow,
  type ProducerRow,
  type ReleaseRow,
  type StaffRow,
  type TagRow,
  type TraitRow,
  type VNRow,
} from '@/lib/types';
import { Selectable } from '@/components/ui/Selection';
import { useSelection } from './Collecting';

const GRID =
  'grid grid-cols-2 items-stretch gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7';
const LIST = 'rounded-lg border border-white/5 bg-surface';
/** The grid's tiles in one sideways row, each about a grid column wide. The
 *  scroll box clips, so it is padded out by the room a tile's hover growth and
 *  border need, and pulled back by as much to stay in line. */
const STRIP =
  '-mx-1 grid auto-cols-[9.5rem] grid-flow-col items-stretch gap-3 overflow-x-auto overscroll-x-contain scroll-px-1 px-1 pb-2 pt-1 snap-x snap-mandatory sm:auto-cols-[10.5rem] [&>*]:snap-start';

/** How each type is laid out. Pictures are looked for by eye and go in a
 *  grid; the rest are looked for by name, and a grid of identical text boxes
 *  is harder to scan than rows. */
const SHAPES: Record<string, { ratio?: string; card: (row: never) => React.ReactNode }> = {
  v: { ratio: COVER, card: (r: VNRow) => <VNCard row={r} /> },
  c: { ratio: PORTRAIT, card: (r: CharacterRow) => <CharacterCard row={r} /> },
  r: { card: (r: ReleaseRow) => <ReleaseCard row={r} /> },
  p: { card: (r: ProducerRow) => <ProducerCard row={r} /> },
  s: { card: (r: StaffRow) => <StaffCard row={r} /> },
  g: { card: (r: TagRow) => <TagCard row={r} /> },
  i: { card: (r: TraitRow) => <TraitCard row={r} /> },
};

function build(type: string, rows: unknown[]): { layout: string; cards: Card[] } | null {
  const shape = SHAPES[type];
  if (!shape) return null;
  const grid = shape.ratio !== undefined;
  return {
    layout: grid ? GRID : LIST,
    cards: (rows as { id: string }[]).map(r => ({
      id: r.id,
      grid,
      node: isGone(r) ? <GoneCard id={r.id} ratio={shape.ratio} /> : shape.card(r as never),
    })),
  };
}

interface Card {
  id: string;
  node: React.ReactNode;
  /** A tile in a grid, rather than a row in a stack. Whatever a caller puts
   *  around a card has to go somewhere different in the two: a tile has a
   *  picture to sit on top of, a row has its own leading icon already. */
  grid: boolean;
}

export function Results({
  type,
  rows,
  wrap,
  strip = false,
}: {
  type: string;
  rows: unknown[];
  /** Put something around each card. */
  wrap?: (card: Card) => React.ReactNode;
  /** One row that scrolls sideways instead of a grid that grows downward. */
  strip?: boolean;
}) {
  const built = build(type, rows);
  const selection = useSelection();
  const ids = built?.cards.map(c => c.id).join(',') ?? '';
  const showing = selection?.showing;

  useEffect(() => {
    showing?.(ids ? ids.split(',') : []);
  }, [showing, ids]);

  if (!built) return null;

  // Inside a Collecting that is selecting, cards become checkboxes.
  const around =
    wrap ??
    ((card: Card) => (
      <Selectable
        active={!!selection}
        on={!!selection?.chosen.includes(card.id)}
        grid={card.grid}
        onToggle={() => selection?.toggle(card.id)}
      >
        {card.node}
      </Selectable>
    ));

  return (
    <div className={strip && built.cards[0]?.grid ? STRIP : built.layout}>
      {built.cards.map(card => (
        // A fragment rather than a wrapper element: the card has to stay a
        // direct child of the grid or the layout is not a grid any more.
        <Fragment key={card.id}>{around(card)}</Fragment>
      ))}
    </div>
  );
}

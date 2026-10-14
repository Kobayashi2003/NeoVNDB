/** One title on the canvas. A real link, so it opens in a new tab like any
 *  other; while the path finder is choosing, a click picks it instead. */
'use client';

import { useRef } from 'react';
import Link from 'next/link';
import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';
import { cn } from '@/lib/utils';
import { display, releaseDate, score } from '@/lib/format';
import { shouldBlur } from '@/lib/content';
import { thumbnailURL } from '@/lib/images';
import { usePrefs } from '@/hooks/usePrefs';
import { ImageWithFallback } from '@/components/ui/ImageWithFallback';
import type { GraphNode } from '@/lib/graph';

type CardData = {
  node: GraphNode;
  root: boolean;
  covers: boolean;
  size: { w: number; h: number };
  /** Out of the picked-out part of the graph. */
  dim: boolean;
  /** The path finder's chosen start. */
  picked: boolean;
  /** Ringed for a moment after "locate". */
  pulse: boolean;
  choosing: boolean;
};

export type CardNode = Node<CardData, 'card'>;

const STATUS: Record<number, { dot: string; label: string }> = {
  0: { dot: 'bg-accent', label: 'Finished' },
  1: { dot: 'bg-yellow-400', label: 'In development' },
  2: { dot: 'bg-red-400', label: 'Cancelled' },
};

export function GraphCard({ data }: NodeProps<CardNode>) {
  const { original, sexual, violence } = usePrefs();
  const { node, root, covers, size, dim, picked, pulse, choosing } = data;
  const title = display(node.title, node.original, original) || node.id;
  const status = STATUS[node.devstatus];
  // A press that ends a pan is not a click on the card under it.
  const press = useRef<{ x: number; y: number } | null>(null);
  const blur = !!node.image && shouldBlur(node.image.sexual, node.image.violence, sexual, violence);

  return (
    <div
      style={{ width: size.w, height: size.h }}
      className={cn('relative transition-opacity duration-200', dim && 'opacity-15')}
    >
      {pulse && (
        <span
          aria-hidden
          className="pointer-events-none absolute -inset-1.5 animate-pulse rounded-xl ring-2 ring-accent"
        />
      )}
      <Handle type="target" position={Position.Top} className="!opacity-0" isConnectable={false} />
      <Link
        href={`/${node.id}`}
        draggable={false}
        title={title}
        // While choosing, the card is a choice, not a way out of the page.
        // data-inert tells the loading bar, which hears the click before this
        // does, that it leads nowhere.
        data-inert={choosing ? '' : undefined}
        onPointerDown={e => (press.current = { x: e.clientX, y: e.clientY })}
        onPointerUp={e => {
          const p = press.current;
          const panned = !!p && Math.hypot(e.clientX - p.x, e.clientY - p.y) > 4;
          if (!choosing) e.currentTarget.toggleAttribute('data-inert', panned);
        }}
        onClick={e => {
          if (choosing || e.currentTarget.hasAttribute('data-inert')) e.preventDefault();
          if (!choosing) e.currentTarget.removeAttribute('data-inert');
        }}
        className={cn(
          'flex h-full items-center gap-2.5 overflow-hidden rounded-lg border bg-surface p-2 transition-colors',
          root ? 'border-accent ring-1 ring-accent/50' : 'border-white/10 hover:border-white/30',
          picked && 'border-sky-400 ring-2 ring-sky-400/50',
        )}
      >
        {covers && (
          <span className="relative h-full aspect-[2/3] shrink-0 overflow-hidden rounded bg-elevated">
            {node.image && (
              <ImageWithFallback
                src={thumbnailURL(node.image)}
                alt=""
                width={node.image.dims[0]}
                height={node.image.dims[1]}
                wrapperClassName="h-full w-full"
                className={cn('h-full w-full object-cover object-top', blur && 'scale-110 blur-md')}
              />
            )}
          </span>
        )}
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="line-clamp-2 text-xs font-semibold leading-snug text-white">
            {title}
          </span>
          <span className="flex items-center gap-1.5 text-[0.6875rem] tabular-nums text-muted">
            {status && (
              <span
                title={status.label}
                aria-label={status.label}
                className={cn('h-1.5 w-1.5 shrink-0 rounded-full', status.dot)}
              />
            )}
            {releaseDate(node.released)}
            {node.rating !== null && <span className="text-accent">{score(node.rating)}</span>}
          </span>
        </span>
      </Link>
      <Handle
        type="source"
        position={Position.Bottom}
        className="!opacity-0"
        isConnectable={false}
      />
    </div>
  );
}

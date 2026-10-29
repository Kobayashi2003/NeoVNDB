/** The whole graph in miniature -- cards, and lines in their relation's colour
 *  -- with the part on screen outlined; a click or drag on it moves the view
 *  there. Shaped like the graph, and out of the way whenever all of the graph
 *  is already on screen, since it would only repeat it. Drawn from the laid-out
 *  positions rather than React Flow's MiniMap, which knows nothing of the
 *  routed lines. */
'use client';

import { useMemo, useRef, type PointerEvent } from 'react';
import { useReactFlow, useStore } from '@xyflow/react';
import { cn } from '@/lib/utils';
import type { Laid } from '@/lib/graphLayout';
import { floating } from '@/components/ui/Surface';
import { relationStyle } from './style';

const MAX_W = 240;
const MAX_H = 150;
const MIN = 72;
const PAD = 8;

export function Overview({
  laid,
  root,
  lit,
}: {
  laid: Laid;
  root: string;
  /** What is picked out on the canvas, picked out here too. */
  lit: { edges: Set<string>; nodes: Set<string> } | null;
}) {
  const [tx, ty, zoom] = useStore(s => s.transform);
  const width = useStore(s => s.width);
  const height = useStore(s => s.height);
  const { setCenter } = useReactFlow();
  const dragging = useRef(false);

  const fit = useMemo(() => {
    if (laid.nodes.length === 0) return null;
    const xs = laid.nodes.map(n => n.x);
    const ys = laid.nodes.map(n => n.y);
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    const w = Math.max(...xs) + laid.card.w - minX;
    const h = Math.max(...ys) + laid.card.h - minY;
    const scale = Math.min((MAX_W - 2 * PAD) / w, (MAX_H - 2 * PAD) / h);
    const boxW = Math.max(MIN, w * scale + 2 * PAD);
    const boxH = Math.max(MIN, h * scale + 2 * PAD);
    return {
      scale,
      boxW,
      boxH,
      bounds: { minX, minY, maxX: minX + w, maxY: minY + h },
      ox: (boxW - w * scale) / 2 - minX * scale,
      oy: (boxH - h * scale) / 2 - minY * scale,
    };
  }, [laid]);

  // Apart from the viewport box, so panning redraws only that.
  const drawing = useMemo(() => {
    if (!fit) return null;
    const { scale, ox, oy } = fit;
    const at = (x: number, y: number) => `${x * scale + ox},${y * scale + oy}`;
    return (
      <>
        {laid.edges.map(e => (
          <polyline
            key={e.key}
            points={e.points.map(p => at(p.x, p.y)).join(' ')}
            fill="none"
            stroke={relationStyle(e.edge.relation).colour}
            strokeWidth={1}
            strokeOpacity={lit && !lit.edges.has(e.key) ? 0.1 : 0.7}
          />
        ))}
        {laid.nodes.map(n => (
          <rect
            key={n.node.id}
            x={n.x * scale + ox}
            y={n.y * scale + oy}
            width={laid.card.w * scale}
            height={laid.card.h * scale}
            rx={1.5}
            className={
              n.node.id === root
                ? 'fill-accent'
                : lit && !lit.nodes.has(n.node.id)
                  ? 'fill-white/10'
                  : 'fill-white/40'
            }
          />
        ))}
      </>
    );
  }, [laid, fit, root, lit]);

  if (!fit) return null;
  const { scale, ox, oy, boxW, boxH, bounds } = fit;

  const view = { x: -tx / zoom, y: -ty / zoom, w: width / zoom, h: height / zoom };
  const slack = 4;
  const allOnScreen =
    view.x <= bounds.minX + slack &&
    view.y <= bounds.minY + slack &&
    view.x + view.w >= bounds.maxX - slack &&
    view.y + view.h >= bounds.maxY - slack;

  const goTo = (e: PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    void setCenter((e.clientX - r.left - ox) / scale, (e.clientY - r.top - oy) / scale, {
      zoom,
      duration: 0,
    });
  };

  return (
    <svg
      width={boxW}
      height={boxH}
      viewBox={`0 0 ${boxW} ${boxH}`}
      aria-label="Overview; click or drag to move the view"
      aria-hidden={allOnScreen}
      className={floating(
        cn(
          'block cursor-grab touch-none transition-opacity duration-300 active:cursor-grabbing',
          allOnScreen && 'pointer-events-none opacity-0',
        ),
      )}
      onPointerDown={e => {
        e.stopPropagation();
        dragging.current = true;
        e.currentTarget.setPointerCapture(e.pointerId);
        goTo(e);
      }}
      onPointerMove={e => dragging.current && goTo(e)}
      onPointerUp={e => {
        dragging.current = false;
        e.currentTarget.releasePointerCapture(e.pointerId);
      }}
    >
      {drawing}
      <rect
        x={view.x * scale + ox}
        y={view.y * scale + oy}
        width={view.w * scale}
        height={view.h * scale}
        rx={2}
        className="fill-white/5 stroke-accent"
        strokeWidth={1}
      />
    </svg>
  );
}

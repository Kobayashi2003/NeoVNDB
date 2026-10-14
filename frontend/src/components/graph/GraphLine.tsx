/** One relation on the canvas: the route ELK chose, rounded at its turns,
 *  with the relation's name on it. A click picks the line out; a drag that
 *  starts on it still pans, which a wide hit area would otherwise prevent. */
'use client';

import { createContext, useContext, useMemo, useRef, type PointerEvent } from 'react';
import {
  BaseEdge,
  EdgeLabelRenderer,
  useReactFlow,
  type Edge,
  type EdgeProps,
} from '@xyflow/react';
import { roundedPath, type Point } from '@/lib/graph';

type LineData = {
  points: Point[];
  label: Point;
  text: string;
  colour: string;
  showLabel: boolean;
};

export type Line = Edge<LineData, 'line'>;

/** How a line tells the view it was clicked; lines are not the view's children. */
export const PickLine = createContext<(key: string) => void>(() => {});

/** Pointer travel that makes a press a pan rather than a click. */
const DRAG = 4;

export function GraphLine({ id, data, style, markerEnd }: EdgeProps<Line>) {
  const pick = useContext(PickLine);
  const { getViewport, setViewport } = useReactFlow();
  const path = useMemo(() => roundedPath(data?.points ?? []), [data?.points]);
  const press = useRef<{ x: number; y: number; vx: number; vy: number; moved: boolean } | null>(
    null,
  );

  const down = (e: PointerEvent<SVGPathElement>) => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    const v = getViewport();
    press.current = { x: e.clientX, y: e.clientY, vx: v.x, vy: v.y, moved: false };
  };
  const move = (e: PointerEvent<SVGPathElement>) => {
    const p = press.current;
    if (!p) return;
    const dx = e.clientX - p.x;
    const dy = e.clientY - p.y;
    if (!p.moved && Math.hypot(dx, dy) < DRAG) return;
    p.moved = true;
    setViewport({ x: p.vx + dx, y: p.vy + dy, zoom: getViewport().zoom });
  };
  const up = (e: PointerEvent<SVGPathElement>) => {
    e.currentTarget.releasePointerCapture(e.pointerId);
    if (press.current && !press.current.moved) pick(id);
    press.current = null;
  };

  return (
    <>
      <BaseEdge path={path} markerEnd={markerEnd} style={style} interactionWidth={0} />
      <path
        d={path}
        fill="none"
        stroke="transparent"
        strokeWidth={16}
        className="cursor-pointer"
        style={{ pointerEvents: 'stroke' }}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
      />
      {data?.showLabel && (
        <EdgeLabelRenderer>
          <span
            className="nodrag nopan pointer-events-none absolute rounded-full border bg-background/90 px-1.5 py-px text-[0.625rem] font-semibold leading-tight"
            style={{
              transform: `translate(-50%, -50%) translate(${data.label.x}px, ${data.label.y}px)`,
              color: data.colour,
              borderColor: `${data.colour}66`,
            }}
          >
            {data.text}
          </span>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

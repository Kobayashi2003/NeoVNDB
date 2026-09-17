/** How one title sits among the others it is related to.
 *
 *  Rows are how far a title is from the one the graph was drawn for, so
 *  reading down the page is reading outward. The lines are coloured by what
 *  the relation is and carry an arrow only where the relation has a direction
 *  -- a sequel points somewhere, "same series" does not.
 *
 *  It scrolls rather than pans. A component can be four thousand pixels wide
 *  and a scrollbar is a thing every reader already knows how to use; a canvas
 *  that only moves when dragged is one they have to discover. */
"use client"

import { useEffect, useRef } from "react"
import Link from "next/link"
import { cn } from "@/lib/utils"
import { VN_RELATION } from "@/lib/enums"
import { display } from "@/lib/format"
import { usePrefs } from "@/hooks/usePrefs"
import {
  edgePath, isSymmetric, layout, NODE_H, NODE_W, tidyEdges, type RelationGraph as Graph,
} from "@/lib/graph"

/** One colour per relation, and dashed where neither end comes first. Chosen
 *  so the three that carry a direction are the three solid lines. */
const STROKE: Record<string, string> = {
  seq: "#1db954",
  side: "#3b82f6",
  fan: "#f59e0b",
  alt: "#a78bfa",
  set: "#9ca3af",
  char: "#ec4899",
  ser: "#14b8a6",
}
const OTHER = "#9ca3af"

export function RelationGraph({ graph }: { graph: Graph }) {
  const { original } = usePrefs()
  const edges = tidyEdges(graph.edges)
  const box = layout(graph, edges)

  // Room for the arrowheads and the cards' own outlines at the edges.
  const pad = 24
  const kinds = [...new Set(edges.map((e) => e.relation))].sort()

  // A wide row makes the graph wider than the window, and the title the reader
  // came for is in the middle of it -- so the view starts there rather than at
  // the far left, which is a part of the graph nobody asked about.
  const frame = useRef<HTMLDivElement>(null)
  const root = box.at.get(graph.root)
  const rootX = root ? root.x : 0
  useEffect(() => {
    const el = frame.current
    if (!el) return
    el.scrollLeft = rootX + pad + NODE_W / 2 - el.clientWidth / 2
  }, [rootX])

  return (
    <div className="flex flex-col gap-3">
      <Legend kinds={kinds} />

      <div
        ref={frame}
        className="overflow-auto overscroll-contain rounded-lg border border-white/5 bg-surface"
      >
        <svg
          width={box.width + pad * 2}
          height={box.height + pad * 2}
          viewBox={`${-pad} ${-pad} ${box.width + pad * 2} ${box.height + pad * 2}`}
          className="block"
          role="img"
          aria-label={`${graph.nodes.length} related visual novels`}
        >
          <defs>
            {kinds
              .filter((k) => !isSymmetric(k))
              .map((k) => (
                <marker
                  key={k}
                  id={`arrow-${k}`}
                  viewBox="0 0 10 10"
                  refX="9"
                  refY="5"
                  markerWidth="5"
                  markerHeight="5"
                  orient="auto-start-reverse"
                >
                  <path d="M 0 0 L 10 5 L 0 10 z" fill={STROKE[k] ?? OTHER} />
                </marker>
              ))}
          </defs>

          {edges.map((e, i) => {
            const a = box.at.get(e.from)
            const b = box.at.get(e.to)
            if (!a || !b) return null
            const colour = STROKE[e.relation] ?? OTHER
            return (
              <path
                key={`${e.from}-${e.to}-${e.relation}-${i}`}
                d={edgePath(a, b)}
                fill="none"
                stroke={colour}
                strokeWidth={1.5}
                strokeOpacity={e.official ? 0.75 : 0.4}
                strokeDasharray={isSymmetric(e.relation) ? "4 4" : undefined}
                markerEnd={isSymmetric(e.relation) ? undefined : `url(#arrow-${e.relation})`}
              />
            )
          })}

          {box.nodes.map((n) => (
            <foreignObject key={n.id} x={n.x} y={n.y} width={NODE_W} height={NODE_H}>
              <Link
                href={`/${n.id}`}
                className={cn(
                  "flex h-full flex-col justify-center gap-0.5 rounded-lg border px-2.5 py-1 transition-colors",
                  n.id === graph.root
                    ? "border-accent bg-accent/15"
                    : "border-white/10 bg-elevated hover:border-white/30",
                )}
              >
                <span className="truncate text-xs font-medium leading-tight">
                  {display(n.title, n.original, original) || n.id}
                </span>
                <span className="truncate text-[0.625rem] text-muted">
                  {n.released || "TBA"}
                </span>
              </Link>
            </foreignObject>
          ))}
        </svg>
      </div>

      {graph.truncated && (
        <p className="text-xs text-muted">
          The web of related titles continues past this. Asking for more depth shows more of it.
        </p>
      )}
    </div>
  )
}

function Legend({ kinds }: { kinds: string[] }) {
  if (kinds.length === 0) return null

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
      {kinds.map((k) => (
        <span key={k} className="flex items-center gap-1.5 text-xs text-muted">
          <svg width="18" height="8" aria-hidden className="shrink-0">
            <line
              x1="0"
              y1="4"
              x2="18"
              y2="4"
              stroke={STROKE[k] ?? OTHER}
              strokeWidth={1.5}
              strokeDasharray={isSymmetric(k) ? "4 4" : undefined}
            />
          </svg>
          {VN_RELATION[k] ?? k}
        </span>
      ))}
    </div>
  )
}

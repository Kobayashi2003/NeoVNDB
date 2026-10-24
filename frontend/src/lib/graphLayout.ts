/** Lays the relation graph out with ELK: layered top to bottom, so a series
 *  reads downward, with every line routed at right angles around the cards.
 *  Plain data out -- positions, routes, label spots -- for the canvas to draw. */

import ELK, { type ElkNode } from 'elkjs/lib/elk-api.js';
import { VN_RELATION } from './enums';
import {
  edgeKey,
  midpoint,
  simplify,
  yearLayers,
  type GraphEdge,
  type GraphNode,
  type Point,
} from './graph';

/** A card's size; ELK and the drawn card must agree on it. */
const CARD = {
  covers: { w: 240, h: 88 },
  plain: { w: 204, h: 58 },
};

export interface LaidNode {
  node: GraphNode;
  x: number;
  y: number;
}

export interface LaidEdge {
  key: string;
  edge: GraphEdge;
  points: Point[];
  label: Point;
  /** False where the label would cover a card or another label. */
  labelFits: boolean;
}

export interface Laid {
  nodes: LaidNode[];
  edges: LaidEdge[];
  card: { w: number; h: number };
  covers: boolean;
}

/** In a worker: a few hundred titles held the page still for seconds while ELK
 *  worked them out, and its 1.4 MB is parsed there as well. */
const elk = new ELK({
  workerFactory: () => new Worker(new URL('./elk.worker.ts', import.meta.url)),
});

const OPTIONS: Record<string, string> = {
  'elk.algorithm': 'layered',
  'elk.direction': 'DOWN',
  'elk.edgeRouting': 'ORTHOGONAL',
  'elk.layered.spacing.nodeNodeBetweenLayers': '110',
  'elk.spacing.nodeNode': '64',
  'elk.spacing.edgeNode': '28',
  'elk.spacing.edgeEdge': '20',
  'elk.layered.spacing.edgeNodeBetweenLayers': '28',
  'elk.layered.spacing.edgeEdgeBetweenLayers': '14',
  'elk.layered.nodePlacement.strategy': 'BRANDES_KOEPF',
};

export async function layoutGraph(
  nodes: GraphNode[],
  edges: GraphEdge[],
  { covers, years }: { covers: boolean; years: boolean },
): Promise<Laid> {
  const card = covers ? CARD.covers : CARD.plain;
  // With year layers each title is pinned to its year's band; ELK still orders
  // within and routes between them.
  const layer = years ? yearLayers(nodes, edges) : null;

  const laid: ElkNode = await elk.layout({
    id: 'graph',
    layoutOptions: layer ? { ...OPTIONS, 'elk.partitioning.activate': 'true' } : OPTIONS,
    children: nodes.map(n => ({
      id: n.id,
      width: card.w,
      height: card.h,
      ...(layer && {
        layoutOptions: { 'elk.partitioning.partition': String(layer.get(n.id) ?? 0) },
      }),
    })),
    edges: edges.map(e => ({ id: edgeKey(e), sources: [e.from], targets: [e.to] })),
  });

  const at = new Map((laid.children ?? []).map(c => [c.id, { x: c.x ?? 0, y: c.y ?? 0 }]));
  const routes = new Map(
    (laid.edges ?? []).map(e => {
      const s = e.sections?.[0];
      return [e.id, s ? [s.startPoint, ...(s.bendPoints ?? []), s.endPoint] : []];
    }),
  );

  const placed = nodes.map(node => ({ node, ...(at.get(node.id) ?? { x: 0, y: 0 }) }));

  // A label goes where it covers neither a card nor a label already placed;
  // the rest are hidden until their line is picked out.
  type Box = { x: number; y: number; w: number; h: number };
  const overlaps = (a: Box, b: Box) =>
    a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  const taken: Box[] = placed.map(p => ({ x: p.x, y: p.y, w: card.w, h: card.h }));

  const routed = edges.map(edge => {
    const key = edgeKey(edge);
    // Simplified once, so the label sits on exactly the line that is drawn.
    const points = simplify(routes.get(key) ?? []);
    const label = midpoint(points);
    const w = Math.min((VN_RELATION[edge.relation] ?? edge.relation).length * 5.6 + 12, 140);
    const box = { x: label.x - w / 2, y: label.y - 8, w, h: 16 };
    const labelFits = !taken.some(b => overlaps(box, b));
    if (labelFits) taken.push(box);
    return { key, edge, points, label, labelFits };
  });

  return { nodes: placed, edges: routed, card, covers };
}

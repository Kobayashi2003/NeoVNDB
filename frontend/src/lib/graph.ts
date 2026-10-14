/** Relation graph layout. The API's depth is already the row, so only the
 *  in-row ordering remains (barycentre sweeps) and no layout library is needed. */

export interface GraphNode {
  id: string;
  title: string;
  original: string | null;
  released: string;
  lang: string;
  /** Steps from the title the graph was drawn for; 0 is that title. */
  depth: number;
}

export interface GraphEdge {
  from: string;
  to: string;
  relation: string;
  official: boolean;
}

export interface RelationGraph {
  root: string;
  depth: number;
  truncated: boolean;
  nodes: GraphNode[];
  edges: GraphEdge[];
}

/** vndb stores both halves of each relation; the backward half (inverse ->
 *  forward) is dropped so each pair draws once. */
const INVERSE: Record<string, string> = { preq: 'seq', par: 'side', orig: 'fan' };

/** No direction, so no arrowhead. */
const SYMMETRIC = new Set(['ser', 'char', 'alt', 'set']);

export function isSymmetric(relation: string): boolean {
  return SYMMETRIC.has(relation);
}

/** One line per pair of titles, pointing the way the relation reads. */
export function tidyEdges(edges: GraphEdge[]): GraphEdge[] {
  const seen = new Set<string>();
  const out: GraphEdge[] = [];

  for (const raw of edges) {
    const forward = INVERSE[raw.relation];
    const e = forward ? { ...raw, from: raw.to, to: raw.from, relation: forward } : raw;

    const pair = e.from < e.to ? `${e.from}|${e.to}` : `${e.to}|${e.from}`;
    const key = `${pair}|${e.relation}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(e);
  }
  return out;
}

export const NODE_W = 184;
export const NODE_H = 54;
const GAP_X = 20;
const GAP_Y = 76;
/** Bow of a same-row line; under GAP_Y so it stays in its row's gap. */
const MAX_BOW = 60;

export interface Placed extends GraphNode {
  x: number;
  y: number;
}

export interface Layout {
  nodes: Placed[];
  at: Map<string, Placed>;
  width: number;
  height: number;
  /** How many nodes sit in each row, deepest last. */
  rows: number[];
}

export function layout(graph: RelationGraph, edges: GraphEdge[]): Layout {
  const rows: GraphNode[][] = [];
  for (const n of graph.nodes) {
    (rows[n.depth] ??= []).push(n);
  }
  for (const row of rows) if (row) row.sort(byReleaseThenTitle);

  const joined = new Map<string, string[]>();
  for (const e of edges) {
    if (!joined.has(e.from)) joined.set(e.from, []);
    if (!joined.has(e.to)) joined.set(e.to, []);
    joined.get(e.from)!.push(e.to);
    joined.get(e.to)!.push(e.from);
  }

  // Barycentre sweeps, down then up, twice; more stops paying off at this size.
  const order = new Map<string, number>();
  const reindex = () => {
    for (const row of rows) {
      if (!row) continue;
      row.forEach((n, i) => order.set(n.id, i));
    }
  };
  reindex();

  const sweep = (from: number, to: number, step: number) => {
    for (let d = from; d !== to; d += step) {
      const row = rows[d];
      const against = rows[d - step];
      if (!row || !against) continue;
      const place = new Map(against.map((n, i) => [n.id, i]));
      const mean = new Map<string, number>();
      for (const n of row) {
        const near = (joined.get(n.id) ?? []).map(id => place.get(id)).filter(i => i !== undefined);
        // Unjoined nodes keep their place instead of drifting to one end.
        mean.set(
          n.id,
          near.length ? near.reduce((a, b) => a + b, 0) / near.length : (order.get(n.id) ?? 0),
        );
      }
      row.sort((a, b) => mean.get(a.id)! - mean.get(b.id)! || byReleaseThenTitle(a, b));
      reindex();
    }
  };
  const last = rows.length - 1;
  for (let pass = 0; pass < 2; pass++) {
    sweep(1, last + 1, 1);
    sweep(last - 1, -1, -1);
  }

  // Floor of 1: Math.max() of nothing is -Infinity.
  const widest = Math.max(1, ...rows.map(r => r?.length ?? 0));
  const width = widest * NODE_W + (widest - 1) * GAP_X;
  const nodes: Placed[] = [];
  rows.forEach((row, depth) => {
    if (!row) return;
    const span = row.length * NODE_W + (row.length - 1) * GAP_X;
    const left = (width - span) / 2;
    row.forEach((n, i) => {
      nodes.push({ ...n, x: left + i * (NODE_W + GAP_X), y: depth * (NODE_H + GAP_Y) });
    });
  });

  // Room under the last row for a bowing line.
  const depthCount = Math.max(1, rows.length);
  return {
    nodes,
    at: new Map(nodes.map(n => [n.id, n])),
    width,
    height: depthCount * NODE_H + (depthCount - 1) * GAP_Y + MAX_BOW,
    rows: rows.map(r => r?.length ?? 0),
  };
}

function byReleaseThenTitle(a: GraphNode, b: GraphNode): number {
  return (a.released || '').localeCompare(b.released || '') || a.title.localeCompare(b.title);
}

/** Between rows: bottom to top, bending near the ends. Within a row: a bow,
 *  since a straight line would cross the cards between. */
export function edgePath(a: Placed, b: Placed): string {
  const ax = a.x + NODE_W / 2;
  const bx = b.x + NODE_W / 2;

  if (a.y === b.y) {
    const y = a.y + NODE_H / 2;
    const lift = Math.min(MAX_BOW, 20 + Math.abs(bx - ax) / 6);
    return `M ${ax} ${y} C ${ax} ${y + lift}, ${bx} ${y + lift}, ${bx} ${y}`;
  }

  const [top, bottom] = a.y < b.y ? [a, b] : [b, a];
  const tx = top.x + NODE_W / 2;
  const bxx = bottom.x + NODE_W / 2;
  const ty = top.y + NODE_H;
  const by = bottom.y;
  const mid = (by - ty) / 2;
  return `M ${tx} ${ty} C ${tx} ${ty + mid}, ${bxx} ${by - mid}, ${bxx} ${by}`;
}

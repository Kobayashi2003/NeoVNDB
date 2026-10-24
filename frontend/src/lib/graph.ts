/** The relation graph's data and the plain functions over it: tidying vndb's
 *  doubled edges, filtering, the path finder, year layers and edge geometry.
 *  No React and no layout engine here, so all of it can be tested alone; the
 *  layout itself is in graphLayout.ts. */

import type { Image } from './types';

export interface GraphNode {
  id: string;
  title: string;
  original: string | null;
  released: string;
  lang: string;
  /** Steps from the title the graph was drawn for; 0 is that title. */
  depth: number;
  /** 0 finished, 1 in development, 2 cancelled. */
  devstatus: number;
  rating: number | null;
  image: Image | null;
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
  /** The deepest the API will walk; 0 when it has no ceiling. */
  max_depth: number;
  /** The deepest step any returned title sits at. */
  reach: number;
  /** The component goes on past what was returned. */
  truncated: boolean;
  /** It was the node ceiling that stopped it, which more depth will not pass. */
  capped: boolean;
  /** The deepest step that draws anything new, whatever depth was asked:
   *  where the graph ends, or where the server's ceilings stop it first. */
  deepest: number;
  nodes: GraphNode[];
  edges: GraphEdge[];
}

/** Which steps out a graph's page offers: every one up to `deepest`, and
 *  `shown` is the one drawn, since a depth past that draws the same graph.
 *  `deeper` says asking for more would draw more. */
export function steps(graph: Pick<RelationGraph, 'depth' | 'deepest'>) {
  const deepest = Math.max(1, graph.deepest);
  const shown = Math.min(graph.depth, deepest);
  return { deepest, shown, deeper: shown < deepest };
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

/** An edge's identity in the drawn graph. */
export function edgeKey(e: GraphEdge): string {
  return `${e.from}>${e.to}:${e.relation}`;
}

function neighbours(edges: GraphEdge[]): Map<string, string[]> {
  const out = new Map<string, string[]>();
  const link = (a: string, b: string) => {
    const list = out.get(a);
    if (list) list.push(b);
    else out.set(a, [b]);
  };
  for (const e of edges) {
    link(e.from, e.to);
    link(e.to, e.from);
  }
  return out;
}

/** The edges `keep` allows, and the titles still reachable from the root
 *  through them: hiding a relation must not leave islands floating about. */
export function subgraph(
  graph: RelationGraph,
  edges: GraphEdge[],
  keep: (e: GraphEdge) => boolean,
): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const kept = edges.filter(keep);
  const near = neighbours(kept);
  const reached = new Set([graph.root]);
  const queue = [graph.root];
  for (let i = 0; i < queue.length; i++) {
    for (const next of near.get(queue[i]) ?? []) {
      if (!reached.has(next)) {
        reached.add(next);
        queue.push(next);
      }
    }
  }
  return {
    nodes: graph.nodes.filter(n => reached.has(n.id)),
    edges: kept.filter(e => reached.has(e.from) && reached.has(e.to)),
  };
}

/** The root, the titles one step from it, and the edges among them. */
export function directOnly(
  root: string,
  part: { nodes: GraphNode[]; edges: GraphEdge[] },
): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const keep = new Set([root]);
  for (const e of part.edges) {
    if (e.from === root) keep.add(e.to);
    if (e.to === root) keep.add(e.from);
  }
  return {
    nodes: part.nodes.filter(n => keep.has(n.id)),
    edges: part.edges.filter(e => keep.has(e.from) && keep.has(e.to)),
  };
}

/** Every edge and title on some simple path between two titles, either way
 *  along the lines -- a relation connects two works whichever way it reads.
 *  All simple paths is exponential, so the walk is capped; real components
 *  stay far inside the caps. Null when the two are not connected. */
export function pathUnion(
  edges: GraphEdge[],
  start: string,
  end: string,
): { edges: Set<string>; nodes: Set<string> } | null {
  if (start === end) return null;
  const near = new Map<string, { to: string; key: string }[]>();
  const link = (a: string, b: string, key: string) => {
    const list = near.get(a);
    if (list) list.push({ to: b, key });
    else near.set(a, [{ to: b, key }]);
  };
  for (const e of edges) {
    link(e.from, e.to, edgeKey(e));
    link(e.to, e.from, edgeKey(e));
  }

  const MAX_PATHS = 20_000;
  const MAX_DEPTH = 40;
  const onEdges = new Set<string>();
  const onNodes = new Set<string>();
  const visited = new Set([start]);
  const trail: string[] = [];
  let found = 0;

  const walk = (node: string) => {
    if (node === end) {
      found++;
      for (const k of trail) onEdges.add(k);
      for (const n of visited) onNodes.add(n);
      return;
    }
    if (trail.length >= MAX_DEPTH) return;
    for (const { to, key } of near.get(node) ?? []) {
      if (found >= MAX_PATHS) return;
      if (visited.has(to)) continue;
      visited.add(to);
      trail.push(key);
      walk(to);
      trail.pop();
      visited.delete(to);
    }
  };
  walk(start);
  return onEdges.size ? { edges: onEdges, nodes: onNodes } : null;
}

/** A layer per release year, earliest first. An undated title takes the year
 *  of its nearest dated relation, so it sits beside them; one with none
 *  anywhere in reach goes in a last layer of its own. */
export function yearLayers(nodes: GraphNode[], edges: GraphEdge[]): Map<string, number> {
  const year = new Map<string, number>();
  for (const n of nodes) {
    const m = /^\d{4}/.exec(n.released);
    if (m) year.set(n.id, Number(m[0]));
  }

  // Breadth-first from every dated title at once, earliest first, so the
  // nearest (and among equals the earliest) year wins.
  const near = neighbours(edges);
  const queue = [...year.keys()].sort((a, b) => year.get(a)! - year.get(b)!);
  for (let i = 0; i < queue.length; i++) {
    for (const next of near.get(queue[i]) ?? []) {
      if (!year.has(next)) {
        year.set(next, year.get(queue[i])!);
        queue.push(next);
      }
    }
  }

  const years = [...new Set(year.values())].sort((a, b) => a - b);
  const index = new Map(years.map((y, i) => [y, i]));
  const layer = new Map<string, number>();
  for (const n of nodes) {
    const y = year.get(n.id);
    layer.set(n.id, y === undefined ? years.length : index.get(y)!);
  }
  return layer;
}

/* ─── Edge geometry ─────────────────────────────────────────────────────── */

export interface Point {
  x: number;
  y: number;
}

/** Drops points that lie on the line between their neighbours, so a straight
 *  run draws straight rather than with a kink at each routing step. */
export function simplify(points: Point[], tolerance = 1.5): Point[] {
  if (points.length <= 2) return points;
  const out = [points[0]];
  for (let i = 1; i < points.length - 1; i++) {
    const a = out[out.length - 1];
    const b = points[i];
    const c = points[i + 1];
    const dx = c.x - a.x;
    const dy = c.y - a.y;
    const off = Math.abs((b.x - a.x) * dy - (b.y - a.y) * dx) / (Math.hypot(dx, dy) || 1);
    if (off > tolerance) out.push(b);
  }
  out.push(points[points.length - 1]);
  return out;
}

/** Straight segments joined by a rounded corner where the line turns. */
export function roundedPath(points: Point[], radius = 14): string {
  if (points.length === 0) return '';
  if (points.length < 3) return points.map((p, i) => `${i ? 'L' : 'M'}${p.x},${p.y}`).join(' ');
  let d = `M${points[0].x},${points[0].y}`;
  for (let i = 1; i < points.length - 1; i++) {
    const [a, b, c] = [points[i - 1], points[i], points[i + 1]];
    const l1 = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const l2 = Math.hypot(c.x - b.x, c.y - b.y) || 1;
    const r = Math.min(radius, l1 / 2, l2 / 2);
    const inX = b.x - ((b.x - a.x) / l1) * r;
    const inY = b.y - ((b.y - a.y) / l1) * r;
    const outX = b.x + ((c.x - b.x) / l2) * r;
    const outY = b.y + ((c.y - b.y) / l2) * r;
    d += ` L${inX},${inY} Q${b.x},${b.y} ${outX},${outY}`;
  }
  const last = points[points.length - 1];
  return `${d} L${last.x},${last.y}`;
}

/** The point halfway along a line, by length: where its label goes. */
export function midpoint(points: Point[]): Point {
  if (points.length === 0) return { x: 0, y: 0 };
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
  }
  let left = total / 2;
  for (let i = 1; i < points.length; i++) {
    const [a, b] = [points[i - 1], points[i]];
    const seg = Math.hypot(b.x - a.x, b.y - a.y);
    if (left <= seg) {
      const t = seg === 0 ? 0 : left / seg;
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    }
    left -= seg;
  }
  return points[points.length - 1];
}

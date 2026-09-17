/** Turning a relation graph into positions, apart from drawing it.
 *
 *  Laying out a graph is normally two hard steps -- decide which row each node
 *  belongs to, then order each row so the lines between them cross as little
 *  as possible. The first one is already done: the API walks outward from one
 *  title and says how many steps away each node is, and that is exactly a row
 *  number. What is left is the ordering, which is the usual barycentre sweep:
 *  put each node near the average position of the neighbours it is joined to,
 *  a few times, alternating which direction is being read from.
 *
 *  That is why there is no layout library here. The expensive half of what one
 *  would do arrives with the data.
 *
 *  Nothing in this file touches the DOM, so what the geometry does can be
 *  worked out by reading it. */

/* --- What the API sends ---------------------------------------------------- */

export interface GraphNode {
  id: string
  title: string
  original: string | null
  released: string
  lang: string
  /** Steps from the title the graph was drawn for; 0 is that title. */
  depth: number
}

export interface GraphEdge {
  from: string
  to: string
  relation: string
  official: boolean
}

export interface RelationGraph {
  root: string
  depth: number
  truncated: boolean
  nodes: GraphNode[]
  edges: GraphEdge[]
}

/* --- Relations ------------------------------------------------------------- */

/** vndb stores both halves of every relation: A is B's sequel and B is A's
 *  prequel are two rows. Drawn as two lines they would be one line drawn
 *  twice, so one of each pair is dropped -- the one that reads backwards.
 *  These are the pairs, given as inverse -> forward. */
const INVERSE: Record<string, string> = { preq: "seq", par: "side", orig: "fan" }

/** Relations where neither end is first. They get no arrowhead, because there
 *  is nothing for it to mean. */
const SYMMETRIC = new Set(["ser", "char", "alt", "set"])

export function isSymmetric(relation: string): boolean {
  return SYMMETRIC.has(relation)
}

/** One line per pair of titles, pointing the way the relation reads. */
export function tidyEdges(edges: GraphEdge[]): GraphEdge[] {
  const seen = new Set<string>()
  const out: GraphEdge[] = []

  for (const raw of edges) {
    const forward = INVERSE[raw.relation]
    // A prequel edge is a sequel edge read from the other end.
    const e = forward ? { ...raw, from: raw.to, to: raw.from, relation: forward } : raw

    const pair = e.from < e.to ? `${e.from}|${e.to}` : `${e.to}|${e.from}`
    const key = `${pair}|${e.relation}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(e)
  }
  return out
}

/* --- Layout ---------------------------------------------------------------- */

export const NODE_W = 184
export const NODE_H = 54
const GAP_X = 20
const GAP_Y = 76
/** How far a line joining two nodes in the same row bows out of it. Kept
 *  under GAP_Y so such a line stays inside the gap below its own row. */
const MAX_BOW = 60

export interface Placed extends GraphNode {
  x: number
  y: number
}

export interface Layout {
  nodes: Placed[]
  at: Map<string, Placed>
  width: number
  height: number
  /** How many nodes sit in each row, deepest last. */
  rows: number[]
}

export function layout(graph: RelationGraph, edges: GraphEdge[]): Layout {
  const rows: GraphNode[][] = []
  for (const n of graph.nodes) {
    ;(rows[n.depth] ??= []).push(n)
  }
  for (const row of rows) if (row) row.sort(byReleaseThenTitle)

  // Who each node is joined to, so a row can be read against its neighbours.
  const joined = new Map<string, string[]>()
  for (const e of edges) {
    if (!joined.has(e.from)) joined.set(e.from, [])
    if (!joined.has(e.to)) joined.set(e.to, [])
    joined.get(e.from)!.push(e.to)
    joined.get(e.to)!.push(e.from)
  }

  // Barycentre sweeps: down the rows, then back up, twice. Each pass puts a
  // node near the average position of its neighbours in the row just read, so
  // the lines between two rows straighten out. Two passes is where it stops
  // paying for itself on graphs this size.
  const order = new Map<string, number>()
  const reindex = () => {
    for (const row of rows) {
      if (!row) continue
      row.forEach((n, i) => order.set(n.id, i))
    }
  }
  reindex()

  const sweep = (from: number, to: number, step: number) => {
    for (let d = from; d !== to; d += step) {
      const row = rows[d]
      const against = rows[d - step]
      if (!row || !against) continue
      const place = new Map(against.map((n, i) => [n.id, i]))
      const mean = new Map<string, number>()
      for (const n of row) {
        const near = (joined.get(n.id) ?? []).map((id) => place.get(id)).filter((i) => i !== undefined)
        // A node joined to nothing in that row keeps where it was, rather than
        // being swept to one end for no reason.
        mean.set(n.id, near.length ? near.reduce((a, b) => a + b, 0) / near.length : (order.get(n.id) ?? 0))
      }
      row.sort((a, b) => mean.get(a.id)! - mean.get(b.id)! || byReleaseThenTitle(a, b))
      reindex()
    }
  }
  const last = rows.length - 1
  for (let pass = 0; pass < 2; pass++) {
    sweep(1, last + 1, 1)
    sweep(last - 1, -1, -1)
  }

  // Max of an empty list is -Infinity, and one node wide would make the gap
  // count negative. Neither should be able to produce a size.
  const widest = Math.max(1, ...rows.map((r) => r?.length ?? 0))
  const width = widest * NODE_W + (widest - 1) * GAP_X
  const nodes: Placed[] = []
  rows.forEach((row, depth) => {
    if (!row) return
    const span = row.length * NODE_W + (row.length - 1) * GAP_X
    const left = (width - span) / 2
    row.forEach((n, i) => {
      nodes.push({ ...n, x: left + i * (NODE_W + GAP_X), y: depth * (NODE_H + GAP_Y) })
    })
  })

  // Room under the last row for a line that bows. The walk does not return
  // edges between two nodes on the frontier, so today nothing bows down there
  // -- but the height should not be the reason it looks right.
  const depthCount = Math.max(1, rows.length)
  return {
    nodes,
    at: new Map(nodes.map((n) => [n.id, n])),
    width,
    height: depthCount * NODE_H + (depthCount - 1) * GAP_Y + MAX_BOW,
    rows: rows.map((r) => r?.length ?? 0),
  }
}

function byReleaseThenTitle(a: GraphNode, b: GraphNode): number {
  return (a.released || "").localeCompare(b.released || "") || a.title.localeCompare(b.title)
}

/** The line between two placed nodes.
 *
 *  Between rows it leaves the bottom of one and arrives at the top of the
 *  next, bending only near the ends so a steep line does not cut across the
 *  cards between. Within a row it bows out sideways instead, because a
 *  straight line there would run through everything in between. */
export function edgePath(a: Placed, b: Placed): string {
  const ax = a.x + NODE_W / 2
  const bx = b.x + NODE_W / 2

  if (a.y === b.y) {
    const y = a.y + NODE_H / 2
    const lift = Math.min(MAX_BOW, 20 + Math.abs(bx - ax) / 6)
    return `M ${ax} ${y} C ${ax} ${y + lift}, ${bx} ${y + lift}, ${bx} ${y}`
  }

  const [top, bottom] = a.y < b.y ? [a, b] : [b, a]
  const tx = top.x + NODE_W / 2
  const bxx = bottom.x + NODE_W / 2
  const ty = top.y + NODE_H
  const by = bottom.y
  const mid = (by - ty) / 2
  return `M ${tx} ${ty} C ${tx} ${ty + mid}, ${bxx} ${by - mid}, ${bxx} ${by}`
}

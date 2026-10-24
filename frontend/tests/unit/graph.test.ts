import { describe, expect, it } from 'vitest';
import {
  directOnly,
  edgeKey,
  midpoint,
  pathUnion,
  roundedPath,
  simplify,
  steps,
  subgraph,
  tidyEdges,
  yearLayers,
  type GraphEdge,
  type GraphNode,
  type RelationGraph,
} from '@/lib/graph';

const node = (id: string, released = ''): GraphNode => ({
  id,
  title: id,
  original: null,
  released,
  lang: 'ja',
  depth: 0,
  devstatus: 0,
  rating: null,
  image: null,
});
const edge = (from: string, to: string, relation = 'seq', official = true): GraphEdge => ({
  from,
  to,
  relation,
  official,
});

describe('relation graph', () => {
  it('draws each pair once, pointing the way the relation reads', () => {
    const tidy = tidyEdges([
      edge('v1', 'v2', 'seq'),
      edge('v2', 'v1', 'preq'),
      edge('v1', 'v3', 'set'),
      edge('v3', 'v1', 'set'),
    ]);
    expect(tidy).toEqual([edge('v1', 'v2', 'seq'), edge('v1', 'v3', 'set')]);
  });

  it('drops titles a hidden relation cut off from the root', () => {
    const graph: RelationGraph = {
      root: 'v1',
      depth: 2,
      max_depth: 8,
      reach: 2,
      truncated: false,
      capped: false,
      deepest: 2,
      nodes: ['v1', 'v2', 'v3', 'v4'].map(id => node(id)),
      edges: [],
    };
    const edges = [
      edge('v1', 'v2', 'seq'),
      edge('v2', 'v3', 'set'),
      edge('v1', 'v4', 'fan', false),
    ];
    const part = subgraph(graph, edges, e => e.relation !== 'set' && e.official);
    expect(part.nodes.map(n => n.id)).toEqual(['v1', 'v2']);
    expect(part.edges).toEqual([edge('v1', 'v2', 'seq')]);

    const near = directOnly(
      'v2',
      subgraph(graph, edges, () => true),
    );
    expect(near.nodes.map(n => n.id)).toEqual(['v1', 'v2', 'v3']);
  });

  it('finds every line on some path between two titles, either way along them', () => {
    // A diamond v1 -> {v2, v3} -> v4, plus a spur off v2 that leads nowhere.
    const edges = [
      edge('v1', 'v2'),
      edge('v1', 'v3'),
      edge('v2', 'v4'),
      edge('v3', 'v4'),
      edge('v2', 'v5'),
    ];
    const found = pathUnion(edges, 'v4', 'v1');
    expect(found && [...found.edges].sort()).toEqual(edges.slice(0, 4).map(edgeKey).sort());
    expect(found?.nodes.has('v5')).toBe(false);
    expect(pathUnion(edges, 'v1', 'v9')).toBeNull();
  });

  it('puts an undated title in the year of its nearest dated relation', () => {
    const nodes = [node('v1', '2001-05-01'), node('v2'), node('v3', '1999'), node('v9')];
    const layer = yearLayers(nodes, [edge('v1', 'v2')]);
    expect(Object.fromEntries(layer)).toEqual({ v3: 0, v1: 1, v2: 1, v9: 2 });
  });
});

describe('edge geometry', () => {
  it('straightens points that lie on one line', () => {
    const pts = [
      { x: 0, y: 0 },
      { x: 0, y: 10 },
      { x: 0, y: 20 },
      { x: 10, y: 20 },
    ];
    expect(simplify(pts)).toEqual([pts[0], pts[2], pts[3]]);
  });

  it('rounds corners and finds the middle by length', () => {
    const pts = [
      { x: 0, y: 0 },
      { x: 0, y: 100 },
      { x: 100, y: 100 },
    ];
    expect(roundedPath(pts, 10)).toBe('M0,0 L0,90 Q0,100 10,100 L100,100');
    expect(midpoint(pts)).toEqual({ x: 0, y: 100 });
  });
});

describe('steps', () => {
  it('offers every step up to the deepest, and no more', () => {
    // A graph that ends three steps out offers three, not a stock five.
    expect(steps({ depth: 2, deepest: 3 })).toEqual({ deepest: 3, shown: 2, deeper: true });
    expect(steps({ depth: 3, deepest: 3 })).toMatchObject({ deeper: false });
  });

  it('draws a deeper ask as the deepest step', () => {
    expect(steps({ depth: 11, deepest: 5 })).toEqual({ deepest: 5, shown: 5, deeper: false });
  });

  it('offers one step for a title with no relations', () => {
    expect(steps({ depth: 2, deepest: 0 })).toEqual({ deepest: 1, shown: 1, deeper: false });
  });
});

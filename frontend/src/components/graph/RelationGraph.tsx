/** The relation graph canvas: pans and zooms, lays itself out again when what
 *  it shows changes, and picks out a line, a relation or a path on request.
 *  A click on a line picks it out; again, every line of its relation; again,
 *  nothing. Escape or a click on empty canvas lets go of whatever is picked. */
'use client';

import '@xyflow/react/dist/base.css';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Background,
  BackgroundVariant,
  MarkerType,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type CoordinateExtent,
  type FitViewOptions,
  type NodeMouseHandler,
} from '@xyflow/react';
import { X } from 'lucide-react';
import { VN_RELATION } from '@/lib/enums';
import { display } from '@/lib/format';
import { usePrefs } from '@/hooks/usePrefs';
import {
  directOnly,
  isSymmetric,
  pathUnion,
  subgraph,
  tidyEdges,
  type RelationGraph as Graph,
} from '@/lib/graph';
import type { Laid } from '@/lib/graphLayout';
import { GraphCard, type CardNode } from './GraphCard';
import { GraphLine, PickLine, type Line } from './GraphLine';
import { GraphPanel, type Switches } from './GraphPanel';
import { Overview } from './Overview';
import { relationStyle } from './style';

const NODE_TYPES = { card: GraphCard };
const EDGE_TYPES = { line: GraphLine };

type Focus =
  | { kind: 'edge'; key: string }
  | { kind: 'relation'; relation: string }
  | { kind: 'path'; edges: Set<string>; ends: [string, string] };

/** `heading` is the page's title block, shown at the top of the floating card. */
export function RelationGraph({ graph, heading }: { graph: Graph; heading: React.ReactNode }) {
  return (
    <ReactFlowProvider>
      <Canvas graph={graph} heading={heading} />
    </ReactFlowProvider>
  );
}

function Canvas({ graph, heading }: { graph: Graph; heading: React.ReactNode }) {
  const { original, graphCovers, graphYears, graphOverview, set } = usePrefs();
  const flow = useReactFlow();
  const all = useMemo(() => tidyEdges(graph.edges), [graph]);

  const [hidden, setHidden] = useState<Set<string>>(() => new Set());
  const [labels, setLabels] = useState(true);
  const [direct, setDirect] = useState(false);
  const [unofficial, setUnofficial] = useState(false);
  const [focus, setFocus] = useState<Focus | null>(null);
  const [choosing, setChoosing] = useState(false);
  const [start, setStart] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  // Counts "locate" presses, so a second press restarts the ring's timer.
  const [pulse, setPulse] = useState(0);
  const [laid, setLaid] = useState<Laid | null>(null);
  const [failed, setFailed] = useState(false);

  const part = useMemo(() => {
    const kept = subgraph(graph, all, e => !hidden.has(e.relation) && (unofficial || e.official));
    return direct ? directOnly(graph.root, kept) : kept;
  }, [graph, all, hidden, unofficial, direct]);

  // Counted over the whole graph, so a hidden relation still says what it hides.
  const kinds = useMemo(() => {
    const count = new Map<string, number>();
    for (const e of all) {
      if (unofficial || e.official) count.set(e.relation, (count.get(e.relation) ?? 0) + 1);
    }
    return [...count].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [all, unofficial]);

  // ELK is loaded with the first layout rather than with the page; the last
  // layout stays up while the next is worked out.
  useEffect(() => {
    let live = true;
    import('@/lib/graphLayout')
      .then(m => m.layoutGraph(part.nodes, part.edges, { covers: graphCovers, years: graphYears }))
      .then(
        next => {
          if (!live) return;
          setLaid(next);
          setFailed(false);
        },
        () => live && setFailed(true),
      );
    return () => {
      live = false;
    };
  }, [part, graphCovers, graphYears]);

  useEffect(() => {
    if (!pulse) return;
    const timer = window.setTimeout(() => setPulse(0), 2000);
    return () => window.clearTimeout(timer);
  }, [pulse]);

  useEffect(() => {
    if (!laid) return;
    const frame = requestAnimationFrame(() => {
      void flow.fitView({ padding: fitPadding(), maxZoom: 1, duration: 250 });
    });
    return () => cancelAnimationFrame(frame);
  }, [laid, flow]);

  // What is picked out, among what is drawn; a filter that removed it all
  // lets go of it without anything having to clear it.
  const lit = useMemo(() => {
    if (!focus || !laid) return null;
    const edges = new Set<string>();
    const nodes = new Set<string>();
    for (const e of laid.edges) {
      const on =
        focus.kind === 'edge'
          ? e.key === focus.key
          : focus.kind === 'relation'
            ? e.edge.relation === focus.relation
            : focus.edges.has(e.key);
      if (!on) continue;
      edges.add(e.key);
      nodes.add(e.edge.from);
      nodes.add(e.edge.to);
    }
    return edges.size ? { edges, nodes } : null;
  }, [focus, laid]);

  const nodes = useMemo<CardNode[]>(
    () =>
      (laid?.nodes ?? []).map(n => ({
        id: n.node.id,
        type: 'card',
        position: { x: n.x, y: n.y },
        width: laid!.card.w,
        height: laid!.card.h,
        draggable: false,
        data: {
          node: n.node,
          root: n.node.id === graph.root,
          covers: laid!.covers,
          size: laid!.card,
          dim: !!lit && !lit.nodes.has(n.node.id),
          picked: n.node.id === start,
          pulse: pulse > 0 && n.node.id === graph.root,
          choosing,
        },
      })),
    [laid, graph.root, lit, start, pulse, choosing],
  );

  const edges = useMemo<Line[]>(
    () =>
      (laid?.edges ?? []).map(e => {
        const { colour, dashed } = relationStyle(e.edge.relation);
        const on = !lit || lit.edges.has(e.key);
        const name = VN_RELATION[e.edge.relation] ?? e.edge.relation;
        return {
          id: e.key,
          source: e.edge.from,
          target: e.edge.to,
          type: 'line',
          zIndex: lit && on ? 1 : 0,
          markerEnd: isSymmetric(e.edge.relation)
            ? undefined
            : { type: MarkerType.ArrowClosed, color: colour },
          style: {
            stroke: colour,
            strokeWidth: lit && on ? 2.5 : 1.75,
            strokeDasharray: dashed ? '6 5' : undefined,
            opacity: on ? (e.edge.official ? 0.9 : 0.45) : 0.08,
            transition: 'opacity 200ms',
          },
          data: {
            points: e.points,
            label: e.label,
            text: e.edge.official ? name : `${name} (unofficial)`,
            colour,
            // Crowded labels are hidden, but never on a line that is picked out.
            showLabel: labels && on && (!!lit || e.labelFits),
          },
        };
      }),
    [laid, lit, labels],
  );

  // Room to pan the graph's far corners to the middle, and no further.
  const extent = useMemo<CoordinateExtent | undefined>(() => {
    if (!laid || laid.nodes.length === 0) return undefined;
    const margin = 600;
    const xs = laid.nodes.map(n => n.x);
    const ys = laid.nodes.map(n => n.y);
    return [
      [Math.min(...xs) - margin, Math.min(...ys) - margin],
      [Math.max(...xs) + laid.card.w + margin, Math.max(...ys) + laid.card.h + margin],
    ];
  }, [laid]);

  const relationOf = useMemo(
    () => new Map((laid?.edges ?? []).map(e => [e.key, e.edge.relation])),
    [laid],
  );
  const pickLine = useCallback(
    (key: string) => {
      const relation = relationOf.get(key);
      if (!relation) return;
      setFocus(f =>
        f?.kind === 'edge' && f.key === key
          ? { kind: 'relation', relation }
          : f?.kind === 'relation' && f.relation === relation
            ? null
            : { kind: 'edge', key },
      );
    },
    [relationOf],
  );

  const stopChoosing = useCallback(() => {
    setChoosing(false);
    setStart(null);
  }, []);

  const letGo = useCallback(() => {
    setFocus(null);
    setNote(null);
    stopChoosing();
  }, [stopChoosing]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && letGo();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [letGo]);

  const onNodeClick: NodeMouseHandler<CardNode> = (_, n) => {
    if (!choosing) return;
    if (!start || start === n.id) {
      setStart(start ? null : n.id);
      setNote(start ? 'Pick where the path starts.' : 'Now pick where it ends.');
      return;
    }
    const found = pathUnion(part.edges, start, n.id);
    stopChoosing();
    if (found) {
      setFocus({ kind: 'path', edges: found.edges, ends: [start, n.id] });
      setNote(null);
    } else {
      setNote('Those two are not connected by the lines shown.');
    }
  };

  const togglePath = () => {
    if (choosing) {
      stopChoosing();
      setNote(null);
    } else {
      setChoosing(true);
      setFocus(null);
      setNote('Pick where the path starts.');
    }
  };

  const locate = () => {
    const root = laid?.nodes.find(n => n.node.id === graph.root);
    if (!laid || !root) return;
    void flow.setCenter(root.x + laid.card.w / 2, root.y + laid.card.h / 2, {
      zoom: Math.max(flow.getZoom(), 0.9),
      duration: 400,
    });
    setPulse(p => p + 1);
  };

  const switches: Switches = {
    covers: graphCovers,
    labels,
    years: graphYears,
    direct,
    unofficial,
    overview: graphOverview,
  };
  const onSwitch = (key: keyof Switches) => {
    if (key === 'covers') set({ graphCovers: !graphCovers });
    else if (key === 'years') set({ graphYears: !graphYears });
    else if (key === 'overview') set({ graphOverview: !graphOverview });
    else if (key === 'labels') setLabels(!labels);
    else if (key === 'direct') setDirect(!direct);
    else setUnofficial(!unofficial);
  };

  const toggleRelation = (relation: string) => {
    const next = new Set(hidden);
    if (!next.delete(relation)) next.add(relation);
    setHidden(next);
  };

  const titleOf = (id: string) => {
    const n = graph.nodes.find(x => x.id === id);
    return n ? display(n.title, n.original, original) || id : id;
  };
  const status = note ?? (lit && focus ? describe(focus, laid, titleOf) : null);

  return (
    <div className="relative h-full w-full">
      <PickLine.Provider value={pickLine}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={NODE_TYPES}
          edgeTypes={EDGE_TYPES}
          onNodeClick={onNodeClick}
          onPaneClick={() => setFocus(null)}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable={false}
          onlyRenderVisibleElements
          translateExtent={extent}
          minZoom={0.1}
          maxZoom={2}
          colorMode="dark"
          attributionPosition="bottom-left"
          aria-label={`${graph.nodes.length} related visual novels`}
          className={choosing ? 'cursor-crosshair' : undefined}
        >
          <Background
            variant={BackgroundVariant.Dots}
            gap={24}
            size={1}
            color="rgba(255, 255, 255, 0.07)"
          />

          <Panel position="top-left" className="!m-3">
            <GraphPanel
              heading={heading}
              shown={part.nodes.length}
              total={graph.nodes.length}
              switches={switches}
              onSwitch={onSwitch}
              kinds={kinds}
              hidden={hidden}
              onRelation={toggleRelation}
              onShowAll={() => setHidden(new Set())}
              choosing={choosing}
              onPath={togglePath}
              onLocate={locate}
              onFit={() => void flow.fitView({ padding: fitPadding(), duration: 300 })}
              onZoomIn={() => void flow.zoomIn({ duration: 200 })}
              onZoomOut={() => void flow.zoomOut({ duration: 200 })}
            />
          </Panel>

          {laid && graphOverview && (
            <Panel position="bottom-right" className="!m-3 hidden md:block">
              <Overview laid={laid} root={graph.root} lit={lit} />
            </Panel>
          )}

          {status && (
            <Panel position="bottom-center" className="!mb-4">
              <div
                role="status"
                className="flex max-w-[min(32rem,calc(100vw-2rem))] items-center gap-2 rounded-full border border-white/10 bg-surface/90 py-1.5 pl-4 pr-1.5 text-xs text-foreground shadow-lg shadow-black/30 backdrop-blur-md animate-slide-up-fade"
              >
                <span className="truncate">{status}</span>
                <button
                  onClick={letGo}
                  aria-label="Clear"
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:bg-white/10 hover:text-white"
                >
                  <X className="h-3.5 w-3.5" aria-hidden />
                </button>
              </div>
            </Panel>
          )}
        </ReactFlow>
      </PickLine.Provider>

      {!laid && (
        <p className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-muted">
          {failed ? 'The graph could not be laid out.' : 'Laying out the graph…'}
        </p>
      )}
    </div>
  );
}

/** Room for the floating card when fitting the graph to the view: beside it
 *  on a wide screen, below it on a phone, where it spans the top. */
function fitPadding(): FitViewOptions['padding'] {
  const card = document.querySelector('[data-graph-card]')?.getBoundingClientRect();
  if (!card) return 0.12;
  return window.matchMedia('(min-width: 768px)').matches
    ? { top: '32px', right: '32px', bottom: '32px', left: `${card.right + 32}px` }
    : { top: `${card.height + 32}px`, right: '16px', bottom: '16px', left: '16px' };
}

function describe(focus: Focus, laid: Laid | null, titleOf: (id: string) => string): string {
  if (focus.kind === 'path') {
    return `Every way from ${titleOf(focus.ends[0])} to ${titleOf(focus.ends[1])}`;
  }
  if (focus.kind === 'relation') {
    return `All lines: ${VN_RELATION[focus.relation] ?? focus.relation} — click again to let go`;
  }
  const e = laid?.edges.find(x => x.key === focus.key)?.edge;
  if (!e) return '';
  const name = VN_RELATION[e.relation] ?? e.relation;
  if (isSymmetric(e.relation)) return `${name}: ${titleOf(e.from)} and ${titleOf(e.to)}`;
  return `${titleOf(e.to)} is a ${name.toLowerCase()} of ${titleOf(e.from)}`;
}

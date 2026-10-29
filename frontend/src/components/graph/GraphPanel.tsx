/** The card floating over the canvas: the page's own heading on top, then the
 *  controls -- moving the view, what the cards and lines show, the path finder,
 *  and the relations, each of which hides or shows its lines. The controls fold
 *  away on a small screen. */
'use client';

import { useState, useSyncExternalStore } from 'react';
import { LocateFixed, Maximize, Route, SlidersHorizontal, ZoomIn, ZoomOut } from 'lucide-react';
import { cn } from '@/lib/utils';
import { VN_RELATION } from '@/lib/enums';
import { ControlLabel } from '@/components/ui/ControlLabel';
import { Chevron } from '@/components/ui/Pill';
import { floating } from '@/components/ui/Surface';
import { relationStyle } from './style';

export interface Switches {
  covers: boolean;
  labels: boolean;
  years: boolean;
  direct: boolean;
  unofficial: boolean;
  overview: boolean;
}

const SWITCHES: { key: keyof Switches; label: string; hint: string }[] = [
  { key: 'covers', label: 'Covers', hint: 'Show each title’s cover' },
  { key: 'labels', label: 'Labels', hint: 'Name the relation on each line' },
  { key: 'years', label: 'Year layers', hint: 'One row per release year, earliest at the top' },
  { key: 'direct', label: 'Direct only', hint: 'Only titles one step from this one' },
  { key: 'unofficial', label: 'Unofficial', hint: 'Include relations vndb marks unofficial' },
  {
    key: 'overview',
    label: 'Overview',
    hint: 'A map of the whole graph while part of it is off screen',
  },
];

export function GraphPanel({
  heading,
  shown,
  total,
  switches,
  onSwitch,
  kinds,
  hidden,
  onRelation,
  onShowAll,
  choosing,
  onPath,
  onLocate,
  onFit,
  onZoomIn,
  onZoomOut,
}: {
  heading: React.ReactNode;
  /** Titles drawn, against titles in the graph: switches and hidden relations drop some. */
  shown: number;
  total: number;
  switches: Switches;
  onSwitch: (key: keyof Switches) => void;
  /** Each relation in the graph and how many lines it has. */
  kinds: [string, number][];
  hidden: Set<string>;
  onRelation: (relation: string) => void;
  onShowAll: () => void;
  choosing: boolean;
  onPath: () => void;
  onLocate: () => void;
  onFit: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
}) {
  // Closed on a phone, where it would cover the graph, until asked for.
  const wide = useSyncExternalStore(onWide, isWide, () => false);
  const [chosen, setOpen] = useState<boolean | null>(null);
  const open = chosen ?? wide;

  return (
    <div
      data-graph-card
      className={floating('pointer-events-auto w-72 max-w-[calc(100vw-1.5rem)] overflow-hidden')}
    >
      {/* An only child: placed among siblings, an element from the server page
          is key-checked after a client navigation and warned about. */}
      <div>{heading}</div>
      <div className="flex items-center gap-1 border-t border-white/5 p-1.5">
        <button
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          className="flex flex-1 items-center gap-2 rounded-lg px-2 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-white/10"
        >
          <SlidersHorizontal className="h-3.5 w-3.5 text-muted" aria-hidden />
          View
          <Chevron open={open} className="ml-auto size-3.5 text-muted" />
        </button>
        <Tool label="Show this title" onClick={onLocate}>
          <LocateFixed />
        </Tool>
        <Tool label="Fit the graph" onClick={onFit}>
          <Maximize />
        </Tool>
      </div>

      {open && (
        <div className="flex max-h-[calc(100dvh-14rem)] flex-col gap-3 overflow-y-auto border-t border-white/5 p-3 animate-slide-up-fade">
          <div className="flex items-center gap-1">
            <Tool label="Zoom out" onClick={onZoomOut}>
              <ZoomOut />
            </Tool>
            <Tool label="Zoom in" onClick={onZoomIn}>
              <ZoomIn />
            </Tool>
            <button
              onClick={onPath}
              aria-pressed={choosing}
              title="Pick two titles to see every way they connect"
              className={cn(
                'ml-auto flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors',
                choosing
                  ? 'bg-sky-500/20 text-sky-300'
                  : 'bg-white/5 text-muted hover:bg-white/10 hover:text-white',
              )}
            >
              <Route className="h-3.5 w-3.5" aria-hidden />
              {choosing ? 'Cancel' : 'Find a path'}
            </button>
          </div>

          <div className="grid grid-cols-2 gap-x-4">
            {SWITCHES.map(s => (
              <button
                key={s.key}
                role="switch"
                aria-checked={switches[s.key]}
                title={s.hint}
                onClick={() => onSwitch(s.key)}
                className={cn(
                  'flex items-center justify-between gap-2 rounded-md px-1 py-1 text-xs transition-colors hover:text-white',
                  switches[s.key] ? 'text-foreground' : 'text-muted',
                )}
              >
                {s.label}
                <span
                  aria-hidden
                  className={cn(
                    'relative h-4 w-7 rounded-full transition-colors',
                    switches[s.key] ? 'bg-accent' : 'bg-white/15',
                  )}
                >
                  <span
                    className={cn(
                      'absolute top-0.5 h-3 w-3 rounded-full bg-white transition-[left]',
                      switches[s.key] ? 'left-3.5' : 'left-0.5',
                    )}
                  />
                </span>
              </button>
            ))}
          </div>

          {kinds.length > 0 && (
            <div className="flex flex-col">
              <div className="mb-1 flex items-center justify-between">
                <ControlLabel>Relations</ControlLabel>
                {hidden.size > 0 && (
                  <button
                    onClick={onShowAll}
                    className="text-[0.6875rem] text-muted transition-colors hover:text-white"
                  >
                    Show all
                  </button>
                )}
              </div>
              {kinds.map(([k, count]) => {
                const { colour, dashed } = relationStyle(k);
                const off = hidden.has(k);
                return (
                  <button
                    key={k}
                    aria-pressed={!off}
                    title={off ? 'Show these lines' : 'Hide these lines'}
                    onClick={() => onRelation(k)}
                    className={cn(
                      'flex items-center gap-2 rounded-md px-1 py-1 text-xs transition-colors hover:bg-white/5',
                      off ? 'text-muted/50' : 'text-foreground',
                    )}
                  >
                    <svg width="20" height="8" aria-hidden className="shrink-0">
                      <line
                        x1="0"
                        y1="4"
                        x2="20"
                        y2="4"
                        stroke={colour}
                        strokeOpacity={off ? 0.3 : 1}
                        strokeWidth={2}
                        strokeDasharray={dashed ? '4 3' : undefined}
                      />
                    </svg>
                    <span className={cn('truncate', off && 'line-through')}>
                      {VN_RELATION[k] ?? k}
                    </span>
                    <span className="ml-auto tabular-nums text-muted">{count}</span>
                  </button>
                );
              })}
              {shown < total && (
                <p className="mt-1.5 px-1 text-[0.6875rem] tabular-nums text-muted">
                  Showing {shown} of {total} titles
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const WIDE = '(min-width: 768px)';
const isWide = () => window.matchMedia(WIDE).matches;
function onWide(change: () => void) {
  const query = window.matchMedia(WIDE);
  query.addEventListener('change', change);
  return () => query.removeEventListener('change', change);
}

function Tool({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      aria-label={label}
      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:bg-white/10 hover:text-white [&>svg]:h-3.5 [&>svg]:w-3.5"
    >
      {children}
    </button>
  );
}

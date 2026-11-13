/** Conditions as a sentence: groups joined by and/or, and the chips in them. */
'use client';

import { Fragment } from 'react';
import { ChevronRight } from 'lucide-react';
import {
  type Condition,
  conditionOf,
  nestable,
  OP_LABEL,
  readCredit,
  readScored,
  relatedType,
} from '@/lib/conditions';
import { type Group, type Leaf, type Node, switchAt } from '@/lib/expr';
import { cn } from '@/lib/utils';
import { Popover, type Step, useBuilder } from './context';
import { useEntityName } from './entity';
import { AddMenu, ModeMenu, TypeIcon } from './menus';
import { Editor } from './editor';
import { useCondition } from './useCondition';
import { listed, values } from './text';
import { RemoveButton } from './parts';

/** A group's items and its add button. `trail` runs from the outermost level
 *  to this group's, whose step names this group. */
export function Flow({
  type,
  node,
  trail,
  top = false,
}: {
  type: string;
  node: Group;
  trail: Step[];
  top?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {node.items.map((item, i) => (
        <span key={item.key} className="inline-flex min-w-0 max-w-full items-center gap-1.5">
          {i > 0 && <Connector node={node} at={i} />}
          {item.kind === 'group' ? (
            <SubGroup type={type} node={item} trail={trail} />
          ) : (
            <Chip type={type} node={item} trail={trail} />
          )}
        </span>
      ))}
      <AddMenu node={node} top={top} trail={trail} />
    </div>
  );
}

/** A condition on another type and the conditions inside it, one level of
 *  the path down from the leaf before it. */
interface Link {
  type: string;
  leaf: Leaf;
  cond: Condition;
  /** The type its conditions are about. */
  inside: string;
  value: Group;
}

function linkOf(type: string, node: Node | undefined): Link | null {
  if (node?.kind !== 'leaf' || typeof node.value === 'string') return null;
  const cond = conditionOf(type, node.name);
  const inside = nestable(cond);
  return cond && inside ? { type, leaf: node, cond, inside, value: node.value } : null;
}

/** A condition on another type, and each one alone inside it: release that
 *  has a producer that has a related producer that... Shown as one block
 *  headed by the path, rather than a block in a block for every level with
 *  nothing else in it. Only "has one with" chains, with no level negated: a
 *  "none" or a "not" is kept in sight as a block of its own. */
function chainOf(type: string, node: Leaf): Link[] {
  const first = linkOf(type, node);
  if (!first) return [];
  const links = [first];
  for (;;) {
    const last = links[links.length - 1];
    if (last.leaf.op !== '=' || last.value.not || last.value.items.length !== 1) break;
    const next = linkOf(last.inside, last.value.items[0]);
    if (!next || next.leaf.op !== '=') break;
    links.push(next);
  }
  return links;
}

/** A block of conditions on another type. Only the outermost is filled: the
 *  same tint laid over itself grew lighter with every level. */
function blockClass(trail: Step[]): string {
  return cn(
    'inline-flex min-w-0 max-w-full flex-wrap items-center gap-1.5 rounded-2xl py-0.5 pr-1 text-xs text-sky-200 ring-1 ring-inset ring-sky-400/25',
    trail.length === 1 && 'bg-sky-400/[0.07]',
  );
}

/** The and/or between two items; clicking switches it, regrouping by precedence. */
function Connector({ node, at }: { node: Group; at: number }) {
  const { edit } = useBuilder();
  return (
    <button
      type="button"
      onClick={() => edit(node.key, n => switchAt(n as Group, at), null)}
      title={`Change to "${node.and ? 'or' : 'and'}"`}
      className="rounded px-1 text-2xs text-muted underline decoration-white/25 decoration-dotted underline-offset-2 transition-colors hover:bg-white/10 hover:text-white"
    >
      {node.and ? 'and' : 'or'}
    </button>
  );
}

function SubGroup({ type, node, trail }: { type: string; node: Group; trail: Step[] }) {
  const { edit } = useBuilder();
  // The same level, in a group of its own: added to, it takes the condition.
  const here = [...trail.slice(0, -1), { ...trail[trail.length - 1], group: node.key }];
  return (
    <span className="inline-flex min-w-0 max-w-full flex-wrap items-center gap-1.5 rounded-2xl bg-white/[0.04] px-1.5 py-1 ring-1 ring-inset ring-white/10">
      <ModeMenu node={node} onRemove={() => edit(node.key, () => null, null)} />
      <span className="text-2xs text-muted">of</span>
      <Flow type={type} node={node} trail={here} />
    </span>
  );
}

/** A condition's name and what it says, opening its editor. In a path, a
 *  level before the last shows its name alone. */
function LeafEditor({
  type,
  cond,
  node,
  named = false,
}: {
  type: string;
  cond: Condition | undefined;
  node: Leaf;
  named?: boolean;
}) {
  const nested = typeof node.value !== 'string';
  return (
    <Popover
      id={`leaf${node.key}`}
      wide
      trigger={(open, toggle) => (
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          className={cn(
            'inline-flex min-w-0 max-w-full items-center gap-1 py-1 text-left',
            named ? 'px-1' : nested ? 'pl-2.5 pr-1.5' : 'pl-2.5 pr-0.5',
          )}
        >
          {relatedType(cond) && (
            <TypeIcon
              type={relatedType(cond)!}
              className={nested ? 'text-sky-300' : 'text-accent/70'}
            />
          )}
          <span className={nested ? 'text-sky-300/80' : 'text-accent/70'}>
            {cond?.label ?? (node.name || 'New condition')}
            {!named && ':'}
          </span>
          {!named && (
            <span className="min-w-0 truncate text-white">
              <Summary cond={cond} node={node} />
            </span>
          )}
        </button>
      )}
    >
      <Editor type={type} cond={cond} node={node} />
    </Popover>
  );
}

function Chip({ type, node, trail }: { type: string; node: Leaf; trail: Step[] }) {
  const { edit } = useBuilder();
  const cond = useCondition(type, node.name);
  const chain = chainOf(type, node);

  if (chain.length > 0) {
    const end = chain[chain.length - 1];
    const inner = [
      ...trail,
      ...chain.map(k => ({ type: k.inside, label: k.cond.label, group: k.value.key })),
    ];
    return (
      // A condition about another type holds its own sentence, so it is set
      // apart from the green property chips in a colour of its own.
      <span className={blockClass(trail)}>
        <span className="inline-flex min-w-0 max-w-full flex-wrap items-center pl-1.5">
          {chain.map((k, i) => (
            <Fragment key={k.leaf.key}>
              {i > 0 && (
                <ChevronRight className="size-3 shrink-0 text-sky-300/40" aria-label="then" />
              )}
              <LeafEditor type={k.type} cond={k.cond} node={k.leaf} named={i < chain.length - 1} />
            </Fragment>
          ))}
        </span>
        {end.value.items.length > 1 && (
          <>
            <ModeMenu node={end.value} />
            <span className="text-2xs text-sky-300/60">of</span>
          </>
        )}
        <Flow type={end.inside} node={end.value} trail={inner} />
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-0.5 rounded-full bg-accent/15 pr-1 text-xs text-accent transition-colors hover:bg-accent/25">
      <LeafEditor type={type} cond={cond} node={node} />
      <RemoveButton label="Remove condition" onClick={() => edit(node.key, () => null, null)} />
    </span>
  );
}

/** What a chip says after its filter's name. */
function Summary({ cond, node }: { cond: Condition | undefined; node: Leaf }) {
  const not = node.op === '!=';
  if (typeof node.value !== 'string') return <span>{not ? 'has none with' : 'has one with'}</span>;
  const value = node.value;
  if (!node.name || !value) return <span className="italic text-accent/60">…</span>;

  switch (cond?.kind) {
    case 'bool':
      return <span>{value === 'true' ? 'yes' : 'no'}</span>;
    case 'enum': {
      const labels = values(value).map(v => cond.choices.find(c => c.value === v)?.label ?? v);
      if (node.op === '>=' || node.op === '<=')
        return <span>{`${OP_LABEL[node.op]} ${labels.join(', ')}`}</span>;
      return <span>{listed(labels, not)}</span>;
    }
    case 'number':
    case 'date':
    case 'resolution': {
      const unit = cond.kind === 'number' && cond.unit ? ` ${cond.unit}` : '';
      return <span>{node.op === '=' ? value + unit : `${OP_LABEL[node.op]} ${value}${unit}`}</span>;
    }
    case 'text':
      return <span>“{value}”</span>;
    case 'relation':
      return <EntityList type={cond.target} ids={values(value)} not={not} />;
    case 'scored': {
      const v = readScored(value, cond.score);
      const extra = [
        v.score && Number(v.score) > 0 ? `≥ ${v.score}` : '',
        v.spoiler === '0' ? 'no spoilers' : v.spoiler === '1' ? 'minor spoilers' : '',
      ].filter(Boolean);
      return (
        <span className="inline-flex min-w-0 items-center gap-1">
          <EntityList type={cond.target} ids={[v.id]} not={not} />
          {extra.length > 0 && <span className="text-accent/60">{extra.join(' · ')}</span>}
        </span>
      );
    }
    case 'credit': {
      const v = readCredit(value);
      const role = cond.roles.find(r => r.value === v.role)?.label;
      return (
        <span className="inline-flex min-w-0 items-center gap-1">
          <EntityList type={cond.target} ids={[v.id]} not={not} />
          {role && <span className="text-accent/60">as {role}</span>}
        </span>
      );
    }
    default:
      return <span className="font-mono">{`${node.op}${value}`}</span>;
  }
}

function EntityList({ type, ids, not }: { type: string; ids: string[]; not: boolean }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-1">
      {not && <span>{ids.length > 1 ? 'none of' : 'not'}</span>}
      {ids.map((id, i) => (
        <Fragment key={id}>
          {i > 0 && <span className="text-accent/60">{not ? ',' : 'or'}</span>}
          <EntityName type={type} id={id} />
        </Fragment>
      ))}
    </span>
  );
}

function EntityName({ type, id }: { type: string; id: string }) {
  return <span className="max-w-40 truncate">{useEntityName(type, id)}</span>;
}

/** The popover body for one condition. */

/** Conditions as a sentence: groups joined by and/or, and the chips in them. */
'use client';

import { Fragment } from 'react';
import {
  type Condition,
  nestable,
  OP_LABEL,
  readCredit,
  readScored,
  relatedType,
} from '@/lib/conditions';
import { type Group, type Leaf, switchAt } from '@/lib/expr';
import { cn } from '@/lib/utils';
import { Popover, useBuilder } from './context';
import { useEntityName } from './entity';
import { AddMenu, ModeMenu, TypeIcon } from './menus';
import { Editor } from './editor';
import { useCondition } from './useCondition';
import { listed, values } from './text';
import { RemoveButton } from './parts';

export function Flow({ type, node, top = false }: { type: string; node: Group; top?: boolean }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {node.items.map((item, i) => (
        <span key={item.key} className="inline-flex min-w-0 max-w-full items-center gap-1.5">
          {i > 0 && <Connector node={node} at={i} />}
          {item.kind === 'group' ? (
            <SubGroup type={type} node={item} />
          ) : (
            <Chip type={type} node={item} />
          )}
        </span>
      ))}
      <AddMenu type={type} node={node} top={top} />
    </div>
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
      className="rounded px-1 text-[0.6875rem] text-muted underline decoration-white/25 decoration-dotted underline-offset-2 transition-colors hover:bg-white/10 hover:text-white"
    >
      {node.and ? 'and' : 'or'}
    </button>
  );
}

function SubGroup({ type, node }: { type: string; node: Group }) {
  const { edit } = useBuilder();
  return (
    <span className="inline-flex min-w-0 max-w-full flex-wrap items-center gap-1.5 rounded-2xl bg-white/[0.04] px-1.5 py-1 ring-1 ring-inset ring-white/10">
      <ModeMenu node={node} onRemove={() => edit(node.key, () => null, null)} />
      <span className="text-[0.6875rem] text-muted">of</span>
      <Flow type={type} node={node} />
    </span>
  );
}

function Chip({ type, node }: { type: string; node: Leaf }) {
  const { edit } = useBuilder();
  const cond = useCondition(type, node.name);
  const nested = typeof node.value !== 'string' ? node.value : null;
  const remove = (
    <RemoveButton label="Remove condition" onClick={() => edit(node.key, () => null, null)} />
  );

  const editor = (
    <Popover
      id={`leaf${node.key}`}
      wide
      trigger={(open, toggle) => (
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          className={cn(
            'inline-flex min-w-0 max-w-full items-center gap-1 py-1 pl-2.5 text-left',
            nested ? 'pr-1.5' : 'pr-0.5',
          )}
        >
          {relatedType(cond) && (
            <TypeIcon
              type={relatedType(cond)!}
              className={nested ? 'text-sky-300' : 'text-accent/70'}
            />
          )}
          <span className={nested ? 'text-sky-300/80' : 'text-accent/70'}>
            {cond?.label ?? (node.name || 'New condition')}:
          </span>
          <span className="min-w-0 truncate text-white">
            <Summary cond={cond} node={node} />
          </span>
        </button>
      )}
    >
      <Editor type={type} cond={cond} node={node} />
    </Popover>
  );

  const inside = nestable(cond);
  if (nested && inside) {
    return (
      // A condition about another type holds its own sentence, so it is set
      // apart from the green property chips in a colour of its own.
      <span className="inline-flex min-w-0 max-w-full flex-wrap items-center gap-1.5 rounded-2xl bg-sky-400/[0.07] py-0.5 pr-1 text-xs text-sky-200 ring-1 ring-inset ring-sky-400/25">
        {editor}
        {nested.items.length > 1 && (
          <>
            <ModeMenu node={nested} />
            <span className="text-[0.6875rem] text-sky-300/60">of</span>
          </>
        )}
        <Flow type={inside} node={nested} />
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-0.5 rounded-full bg-accent/15 pr-1 text-xs text-accent transition-colors hover:bg-accent/25">
      {editor}
      {remove}
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
    case 'entity':
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

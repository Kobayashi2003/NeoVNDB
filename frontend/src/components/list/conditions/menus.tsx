/** The builder's menus: a group's mode, adding a condition, and the list of
 *  filters to choose from. */
'use client';

import { Fragment, useState } from 'react';
import {
  BookOpen,
  Building2,
  ChevronRight,
  Disc3,
  type LucideIcon,
  PenLine,
  Plus,
  Sparkle,
  Tag,
  UserRound,
} from 'lucide-react';
import { conditionOf, nestable, offered, relatedType } from '@/lib/conditions';
import { group, type Group, leaf, type Leaf, type Node } from '@/lib/expr';
import { cn } from '@/lib/utils';
import { menuItem, MenuLabel, MenuMark } from '@/components/ui/Menu';
import { Chevron } from '@/components/ui/Pill';
import { Popover, type Step, useBuilder } from './context';
import { RemoveItem, SearchBox } from './parts';

/* --- Groups ----------------------------------------------------------------- */

const MODES = [
  { value: 'all', and: true, not: false, label: 'all', hint: 'every condition matches' },
  { value: 'any', and: false, not: false, label: 'any', hint: 'at least one matches' },
  { value: 'none', and: false, not: true, label: 'none', hint: 'no condition matches' },
  { value: 'notall', and: true, not: true, label: 'not all', hint: 'at least one fails' },
];

export function ModeMenu({ node, onRemove }: { node: Group; onRemove?: () => void }) {
  const { edit } = useBuilder();
  const mode = MODES.find(m => m.and === node.and && m.not === node.not)!;
  return (
    <Popover
      id={`mode${node.key}`}
      wide
      trigger={(open, toggle) => (
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          className={cn(
            'inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-medium transition-colors',
            node.not ? 'bg-red-400/15 text-red-300' : 'bg-white/10 text-white hover:bg-white/15',
          )}
        >
          {mode.label}
          <Chevron open={open} />
        </button>
      )}
    >
      {MODES.map(m => (
        <button
          key={m.value}
          type="button"
          onClick={() => edit(node.key, n => ({ ...(n as Group), and: m.and, not: m.not }), null)}
          className={menuItem()}
        >
          <MenuMark kind="radio" on={m === mode} />
          <span className="font-medium">{m.label}</span>
          <span className="ml-auto text-muted">{m.hint}</span>
        </button>
      ))}
      {onRemove && <RemoveItem onClick={onRemove}>Remove group</RemoveItem>}
    </Popover>
  );
}

/** Adds a condition to this group, or, going up the path at the top of the
 *  menu, to a group around it; going down a relation's "›", a condition on
 *  what that relation reaches, made in one step: staff=(gender=f). */
export function AddMenu({
  node,
  top,
  trail,
}: {
  node: Group;
  top: boolean;
  /** From the outermost level to this group's. */
  trail: Step[];
}) {
  const { edit } = useBuilder();
  const last = trail.length - 1;
  const [at, setAt] = useState(last);
  const [down, setDown] = useState<string[]>([]);
  const target = trail[Math.min(at, last)];
  // The type the list offers: the target's, followed down the relations taken.
  const below: Step[] = [];
  let shown = target.type;
  for (const name of down) {
    const cond = conditionOf(shown, name);
    shown = nestable(cond) ?? shown;
    below.push({ type: shown, label: cond?.label ?? name, group: 0 });
  }

  const put = (made: Node, then: string | null) =>
    edit(target.group, n => ({ ...(n as Group), items: [...(n as Group).items, made] }), then);
  const add = (name: string) => {
    const bool = conditionOf(shown, name)?.kind === 'bool';
    const inner = leaf(name, '=', bool ? 'true' : '');
    // Wrapped from the inside out in each relation gone down.
    const made = down.reduceRight<Leaf>((n, rel) => leaf(rel, '=', group(true, [n])), inner);
    put(made, bool ? null : `leaf${inner.key}`);
  };
  const addGroup = () => {
    const made = group(!(at === last ? node.and : true));
    put(made, `add${made.key}`);
  };
  const go = (to: number, path: string[] = []) => {
    setAt(to);
    setDown(path);
  };
  const labelled = top || node.items.length === 0;

  return (
    <Popover
      id={`add${node.key}`}
      wide
      trigger={(open, toggle) => (
        <button
          type="button"
          onClick={() => {
            if (!open) go(last);
            toggle();
          }}
          aria-expanded={open}
          aria-label="Add a condition"
          className={cn(
            'inline-flex items-center gap-1 rounded-full border border-dashed text-xs transition-colors',
            labelled ? 'px-3 py-1' : 'size-6 justify-center',
            open
              ? 'border-white/30 bg-white/10 text-white'
              : 'border-white/15 text-muted hover:border-white/30 hover:text-white',
          )}
        >
          <Plus className={cn('size-3', labelled && 'icon-text')} aria-hidden />
          {labelled && (node.items.length === 0 ? 'Add a condition' : 'Add')}
        </button>
      )}
    >
      {(trail.length > 1 || down.length > 0) && (
        <Where
          trail={trail}
          at={Math.min(at, last)}
          below={below}
          onLevel={i => go(i)}
          onBelow={i => go(at, down.slice(0, i + 1))}
        />
      )}
      <FilterList
        key={`${at}/${down.join('/')}`}
        type={shown}
        onPick={add}
        onDown={name => setDown([...down, name])}
      />
      {down.length === 0 && (
        <>
          <div className="-mx-1 my-1 h-px bg-white/10" role="separator" />
          <button type="button" onClick={addGroup} className={menuItem()}>
            <Plus className="icon-text size-3.5 text-muted" aria-hidden />
            Group of conditions
          </button>
        </>
      )}
    </Popover>
  );
}

/** Where a new condition goes, as a path: each level on the way to this
 *  group, which can be chosen instead, and the relations gone down from it. */
function Where({
  trail,
  at,
  below,
  onLevel,
  onBelow,
}: {
  trail: Step[];
  at: number;
  below: Step[];
  onLevel: (i: number) => void;
  onBelow: (i: number) => void;
}) {
  // Past the chosen level the path goes on down the relations taken, not
  // back to the levels the menu was opened at.
  const levels = below.length > 0 ? trail.slice(0, at + 1) : trail;
  const steps = [
    ...levels.map((s, i) => ({
      s,
      on: i === at && below.length === 0,
      go: () => onLevel(i),
      after: i > at,
    })),
    ...below.map((s, i) => ({ s, on: i === below.length - 1, go: () => onBelow(i), after: false })),
  ];
  return (
    <nav
      aria-label="Add to"
      className="flex flex-wrap items-center gap-x-0.5 gap-y-1 px-1.5 pb-1.5 text-2xs text-muted"
    >
      <span className="mr-1">Add to</span>
      {steps.map(({ s, on, go, after }, i) => (
        <Fragment key={i}>
          {i > 0 && <ChevronRight className="size-3 shrink-0 text-white/25" aria-hidden />}
          <button
            type="button"
            onClick={go}
            aria-current={on || undefined}
            className={cn(
              'inline-flex items-center gap-1 rounded px-1 py-0.5 transition-colors hover:bg-white/10 hover:text-white',
              on ? 'font-medium text-white' : after ? 'text-white/35' : 'text-sky-200/80',
            )}
          >
            <TypeIcon type={s.type} />
            {s.label}
          </button>
        </Fragment>
      ))}
    </nav>
  );
}

/** The icon for each type, marking conditions that reach another type. */
const TYPE_ICON: Record<string, LucideIcon> = {
  v: BookOpen,
  r: Disc3,
  c: UserRound,
  p: Building2,
  s: PenLine,
  g: Tag,
  i: Sparkle,
};

export function TypeIcon({ type, className }: { type: string; className?: string }) {
  const Icon = TYPE_ICON[type];
  return Icon ? <Icon className={cn('icon-text size-3 shrink-0', className)} aria-hidden /> : null;
}

/** The item's own properties first, then conditions about related items.
 *  With onDown, each relation also offers to go down into what it reaches. */
export function FilterList({
  type,
  onPick,
  onDown,
}: {
  type: string;
  onPick: (name: string) => void;
  onDown?: (name: string) => void;
}) {
  const [term, setTerm] = useState('');
  const q = term.trim().toLowerCase();
  const shown = offered(type).filter(c => c.label.toLowerCase().includes(q));
  const own = shown.filter(c => !relatedType(c));
  const related = shown.filter(c => relatedType(c));
  const first = own[0] ?? related[0];
  return (
    <>
      <SearchBox
        value={term}
        onChange={setTerm}
        label="Find a filter"
        onEnter={() => first && onPick(first.key)}
      />
      <div className="max-h-72 overflow-y-auto overscroll-contain">
        {own.length > 0 && <MenuLabel>Properties</MenuLabel>}
        {own.map(c => (
          <button key={c.key} type="button" onClick={() => onPick(c.key)} className={menuItem()}>
            {c.label}
          </button>
        ))}
        {related.length > 0 && <MenuLabel>Related</MenuLabel>}
        {related.map(c => (
          <div key={c.key} className="flex items-center">
            <button
              type="button"
              onClick={() => onPick(c.key)}
              className={cn(menuItem(), 'flex-1')}
            >
              <TypeIcon type={relatedType(c)!} className="text-sky-300/80" />
              {c.label}
            </button>
            {onDown && nestable(c) && (
              <button
                type="button"
                onClick={() => onDown(c.key)}
                aria-label={`Conditions on ${c.label.toLowerCase()}`}
                title={`Conditions on ${c.label.toLowerCase()}`}
                className="ml-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted transition-colors hover:bg-white/10 hover:text-white"
              >
                <ChevronRight className="size-3.5" aria-hidden />
              </button>
            )}
          </div>
        ))}
        {shown.length === 0 && <p className="px-2.5 py-1.5 text-xs text-muted">No such filter.</p>}
      </div>
    </>
  );
}

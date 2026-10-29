/** The controls that narrow a listing: one menu per common filter, plus the
 *  condition builder for anything else. Every control is a link, so a narrowed
 *  listing is an address, and hand-written parameters survive every click.
 *
 *  From sm up the filters are a row of pills. Below that they would wrap into
 *  several rows, so they collapse into a Filters button (a panel of one row per
 *  filter) beside the sort menu, with what is active listed underneath. */
'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ChevronRight, ListFilter, SlidersHorizontal, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { facet } from '@/lib/api';
import { LIST } from '@/lib/list';
import { ControlLabel } from '@/components/ui/ControlLabel';
import { MenuLabel, MenuMark, MenuPanel, menuAction, menuItem } from '@/components/ui/Menu';
import { Chevron, pill } from '@/components/ui/Pill';
import { filtersOf, one, withParams, type Params } from '@/lib/href';
import { useMenu } from '@/hooks/useMenu';
import type { Choice, Filter } from '@/lib/filters';
import { ConditionBuilder } from './conditions/ConditionBuilder';
import { SortMenu, type SortState } from '@/components/results/SortMenu';

/** The values of one filter currently in the address. */
function selected(params: Params, key: string): string[] {
  const raw = one(params, key);
  return raw ? raw.split(',').filter(Boolean) : [];
}

/** A single-valued filter replaces; a multiple one toggles within the list. */
function toggled(path: string, params: Params, filter: Filter, value: string): string {
  const now = selected(params, filter.key);
  const has = now.includes(value);
  const next = filter.multiple
    ? has
      ? now.filter(v => v !== value)
      : [...now, value]
    : has
      ? []
      : [value];
  return withParams(path, params, { [filter.key]: next.join(',') || null, page: null });
}

export function FilterBar({
  type,
  path,
  params,
  filters,
  sort,
}: {
  type: string;
  path: string;
  params: Params;
  filters: Filter[];
  /** Shown beside the Filters button on narrow screens. */
  sort?: SortState;
}) {
  const expression = one(params, 'f') ?? '';
  const [building, setBuilding] = useState(expression !== '');
  const [panel, setPanel] = useState(false);

  const active = filters.flatMap(f => selected(params, f.key).map(value => ({ filter: f, value })));
  const count = active.length + (expression ? 1 : 0);
  const clearAll = withParams(
    path,
    params,
    Object.fromEntries([...filters.map(f => [f.key, null]), ['f', null], ['page', null]]),
  );

  const chips = (
    <>
      {active.map(({ filter, value }) => (
        <Link
          key={`${filter.key}-${value}`}
          href={toggled(path, params, filter, value)}
          aria-label={`Remove ${filter.label}: ${labelOf(filter, value)}`}
          className="inline-flex items-center gap-1 rounded-full bg-accent/15 px-2.5 py-1 text-xs text-accent transition-colors hover:bg-accent/25"
        >
          {/* Named with its filter: a bare "No" is ambiguous. */}
          <span className="text-accent/60">{filter.label}</span>
          {labelOf(filter, value)}
          <X className="icon-text h-3 w-3" aria-hidden />
        </Link>
      ))}
      {expression && !building && (
        <Link
          href={withParams(path, params, { f: null, page: null })}
          aria-label="Remove conditions"
          title={expression}
          className="inline-flex min-w-0 max-w-80 items-center gap-1 rounded-full bg-accent/15 px-2.5 py-1 text-xs text-accent transition-colors hover:bg-accent/25"
        >
          <span className="truncate font-mono">{expression}</span>
          <X className="icon-text h-3 w-3 shrink-0" aria-hidden />
        </Link>
      )}
    </>
  );

  return (
    <div className="flex flex-col gap-2">
      {/* Narrow screens: one toolbar row, a panel of filters, active chips. */}
      <div className="flex items-center gap-2 sm:hidden">
        <button
          type="button"
          onClick={() => setPanel(p => !p)}
          aria-expanded={panel}
          className={pill({ tone: count > 0 || panel ? 'on' : 'filled', className: 'gap-1.5' })}
        >
          <SlidersHorizontal className="icon-text size-3" aria-hidden />
          Filters
          {count > 0 && <span className="tabular-nums text-muted">· {count}</span>}
          <Chevron open={panel} />
        </button>
        {sort && <SortMenu path={path} params={params} {...sort} align="end" />}
      </div>

      {panel && (
        <div className="flex flex-col rounded-xl border border-white/10 bg-surface p-1 sm:hidden">
          {filters.map(filter => (
            <FilterMenu
              key={filter.key}
              type={type}
              path={path}
              params={params}
              filter={filter}
              chosen={selected(params, filter.key)}
              row
            />
          ))}
          <button
            type="button"
            onClick={() => {
              setBuilding(b => !b);
              setPanel(false);
            }}
            className={ROW}
          >
            <span className="inline-flex items-center gap-1.5">
              <ListFilter className="icon-text size-3.5 text-muted" aria-hidden />
              Conditions
            </span>
            <span className="inline-flex items-center gap-1 text-xs text-muted">
              {expression ? 'On' : 'None'}
              <ChevronRight className="icon-text size-3.5" aria-hidden />
            </span>
          </button>
          {count > 0 && (
            <Link
              href={clearAll}
              onClick={() => setPanel(false)}
              className="self-end px-2.5 py-2 text-xs text-muted hover:text-white"
            >
              Clear all
            </Link>
          )}
        </div>
      )}

      {(active.length > 0 || (expression && !building)) && (
        <div className="flex flex-wrap items-center gap-1 sm:hidden">{chips}</div>
      )}

      {/* From sm up: the row of pills. */}
      <div className="hidden flex-wrap items-center gap-1 sm:flex">
        <ControlLabel>Filter</ControlLabel>

        {filters.map(filter => (
          <FilterMenu
            key={filter.key}
            type={type}
            path={path}
            params={params}
            filter={filter}
            chosen={selected(params, filter.key)}
          />
        ))}

        <button
          type="button"
          onClick={() => setBuilding(b => !b)}
          aria-expanded={building}
          className={pill({ tone: expression ? 'on' : 'quiet', size: 'sm' })}
        >
          <ListFilter className="icon-text h-3 w-3" aria-hidden />
          Conditions
          <Chevron open={building} />
        </button>

        {chips}

        {count > 1 && (
          <Link
            href={clearAll}
            className="ml-1 text-xs text-muted transition-colors hover:text-white"
          >
            Clear all
          </Link>
        )}
      </div>

      {building && (
        <ConditionBuilder
          key={expression}
          type={type}
          path={path}
          params={params}
          current={expression}
        />
      )}
    </div>
  );
}

/** A row in the narrow-screen filters panel. */
const ROW =
  'flex w-full items-center justify-between gap-3 rounded-lg px-2.5 py-2 text-left text-sm text-white/90 transition-colors hover:bg-white/[0.06]';

function labelOf(filter: Filter, value: string): string {
  return filter.choices.find(c => c.value === value)?.label ?? value;
}

/** What a filter is set to, for the panel row. */
function summary(filter: Filter, chosen: string[]): string {
  if (chosen.length === 0) return 'Any';
  if (chosen.length === 1) return labelOf(filter, chosen[0]);
  return `${chosen.length} chosen`;
}

/** How many results each choice would leave, asked for once the menu opens and
 *  again only when the rest of the address changes. Null until it answers, and
 *  for good if it cannot: the menu works the same without the numbers. */
function useCounts(open: boolean, type: string, filter: Filter, params: Params) {
  const request = useMemo(
    () => ({
      type: LIST[type].type,
      filter: filter.key,
      values: filter.choices.map(c => c.value),
      filters: filtersOf(params),
    }),
    [type, filter, params],
  );
  const key = JSON.stringify(request);
  const [answer, setAnswer] = useState<{ key: string; counts: Record<string, number> } | null>(
    null,
  );
  const have = answer?.key === key;

  useEffect(() => {
    if (!open || have) return;
    let live = true;
    facet(request.type, request.filter, request.values, request.filters)
      .then(counts => live && setAnswer({ key, counts }))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [open, have, key, request]);

  return have ? answer.counts : null;
}

function FilterMenu({
  type,
  path,
  params,
  filter,
  chosen,
  row = false,
}: {
  type: string;
  path: string;
  params: Params;
  filter: Filter;
  chosen: string[];
  /** A full-width row for the narrow-screen panel instead of a pill. */
  row?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const { box, panel: menu } = useMenu(open, setOpen);
  const counts = useCounts(open, type, filter, params);
  const cleared = withParams(path, params, { [filter.key]: null, page: null });

  return (
    <div ref={box} className="relative">
      {row ? (
        <button type="button" onClick={() => setOpen(o => !o)} aria-expanded={open} className={ROW}>
          {filter.label}
          <span
            className={cn(
              'inline-flex min-w-0 items-center gap-1 text-xs',
              chosen.length ? 'text-accent' : 'text-muted',
            )}
          >
            <span className="truncate">{summary(filter, chosen)}</span>
            <ChevronRight
              className={cn(
                'icon-text size-3.5 shrink-0 transition-transform',
                open && 'rotate-90',
              )}
              aria-hidden
            />
          </span>
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          aria-expanded={open}
          className={pill({ tone: chosen.length > 0 ? 'on' : 'quiet', size: 'sm' })}
        >
          {filter.label}
          {chosen.length === 1 && !filter.multiple && (
            <span className="font-normal text-white/70">{labelOf(filter, chosen[0])}</span>
          )}
          {filter.multiple && chosen.length > 0 && (
            <span className="tabular-nums text-muted">{chosen.length}</span>
          )}
          <Chevron open={open} />
        </button>
      )}

      {open && (
        <MenuPanel ref={menu} scroll align={row ? 'end' : 'start'}>
          <MenuLabel
            action={
              chosen.length > 0 && (
                <Link href={cleared} onClick={() => setOpen(false)} className={menuAction}>
                  Clear
                </Link>
              )
            }
          >
            {filter.multiple ? `${filter.label} · any of` : filter.label}
          </MenuLabel>
          {filter.choices.map(choice => (
            <Option
              key={choice.value}
              href={toggled(path, params, filter, choice.value)}
              choice={choice}
              on={chosen.includes(choice.value)}
              multiple={!!filter.multiple}
              count={counts?.[choice.value]}
            />
          ))}
        </MenuPanel>
      )}
    </div>
  );
}

function Option({
  href,
  choice,
  on,
  multiple,
  count,
}: {
  href: string;
  choice: Choice;
  on: boolean;
  multiple: boolean;
  /** What choosing it would leave, once known. */
  count?: number;
}) {
  return (
    <Link
      href={href}
      className={menuItem({
        className: cn(on && 'text-white', count === 0 && !on && 'text-muted/60'),
      })}
      aria-current={on || undefined}
    >
      <MenuMark kind={multiple ? 'check' : 'radio'} on={on} />
      {choice.icon && <span className={cn(choice.icon, 'shrink-0')} aria-hidden />}
      <span className="truncate">{choice.label}</span>
      {count !== undefined && (
        <span className="ml-auto pl-3 text-xs tabular-nums text-muted">
          {count.toLocaleString()}
        </span>
      )}
    </Link>
  );
}

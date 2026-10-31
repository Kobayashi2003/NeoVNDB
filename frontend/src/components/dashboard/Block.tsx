/** One dashboard section: the site's section heading (so the section row at
 *  the top lists it), a control beside it, and the content, which a button
 *  swaps for the same numbers as a table so no value is reachable only by
 *  hovering. */
'use client';

import { useState } from 'react';
import { ChartColumn, Table2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { iconButton } from '@/components/ui/Pill';
import { Section } from '@/components/ui/Section';
import { surface } from '@/components/ui/Surface';

export interface TableView {
  head: string[];
  rows: (string | number)[][];
}

export function Block({
  title,
  count,
  action,
  table,
  children,
}: {
  title: string;
  count?: number;
  action?: React.ReactNode;
  table?: TableView;
  children: React.ReactNode;
}) {
  const [asTable, setAsTable] = useState(false);
  const toggle = table && (
    <button
      type="button"
      onClick={() => setAsTable(t => !t)}
      aria-pressed={asTable}
      title={asTable ? 'Show as a chart' : 'Show as a table'}
      aria-label={asTable ? 'Show as a chart' : 'Show as a table'}
      className={iconButton()}
    >
      {asTable ? (
        <ChartColumn className="size-3.5" aria-hidden />
      ) : (
        <Table2 className="size-3.5" aria-hidden />
      )}
    </button>
  );
  return (
    <Section
      title={title}
      count={count}
      action={
        (action || toggle) && (
          <div className="flex flex-wrap items-center justify-end gap-2">
            {action}
            {toggle}
          </div>
        )
      }
    >
      {asTable && table ? (
        <Swap view="table">
          <Table {...table} />
        </Swap>
      ) : (
        // Its content still stretches when the section is stretched to its pair.
        <Swap view="chart" className="flex flex-col [&>*]:flex-1">
          {children}
        </Swap>
      )}
    </Section>
  );
}

/** Its children settle in whenever `view` changes, rather than cutting. */
function Swap({
  view,
  className,
  children,
}: {
  view: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div key={view} className={cn('animate-swap-in', className)}>
      {children}
    </div>
  );
}

/** The surface a chart sits on, so charts read as one family. `view` names
 *  what it is showing, where that can be swapped. */
export function Plot({
  view,
  className,
  children,
}: {
  view?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={surface(cn('p-4', className))}>
      {view === undefined ? (
        children
      ) : (
        <Swap view={view} className="h-full">
          {children}
        </Swap>
      )}
    </div>
  );
}

/** A cell's sides: the box's own inset, on the outer cells. */
const CELL = 'px-2 first:pl-4 last:pr-4';

function Table({ head, rows }: TableView) {
  return (
    // The padding is the cells', not the box's, so the pinned heading's band
    // runs edge to edge rather than ending flush with its text.
    <div className={surface('max-h-96 overflow-auto pb-1.5')}>
      <table className="w-full text-xs">
        <thead className="sticky top-0 bg-surface-solid text-left text-muted shadow-[0_1px_0_rgb(255_255_255/0.1)]">
          <tr>
            {head.map((h, i) => (
              <th key={h} className={cn(CELL, 'pb-2 pt-2.5 font-medium', i > 0 && 'text-right')}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, r) => (
            <tr key={String(row[0])} className={cn(r > 0 && 'border-t border-white/5')}>
              {row.map((cell, i) => (
                <td key={i} className={cn(CELL, 'py-1.5', i > 0 && 'text-right tabular-nums')}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

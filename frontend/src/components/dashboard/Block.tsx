/** One dashboard section: the site's section heading (so the section row at
 *  the top lists it), a control beside it, and the content, which a button
 *  swaps for the same numbers as a table so no value is reachable only by
 *  hovering. */
'use client';

import { useState } from 'react';
import { ChartColumn, Table2 } from 'lucide-react';
import { cn } from '@/lib/utils';
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
      className="rounded-full p-1.5 text-muted transition-colors hover:bg-white/10 hover:text-white"
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
      {asTable && table ? <Table {...table} /> : children}
    </Section>
  );
}

/** The surface a chart sits on, so charts read as one family. */
export function Plot({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={surface(cn('p-4', className))}>{children}</div>;
}

function Table({ head, rows }: TableView) {
  return (
    <div className={surface('max-h-96 overflow-auto px-4 py-2')}>
      <table className="w-full text-xs">
        <thead className="sticky top-0 bg-surface-solid text-left text-muted">
          <tr>
            {head.map((h, i) => (
              <th key={h} className={cn('py-1.5 font-medium', i > 0 && 'text-right')}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(row => (
            <tr key={String(row[0])} className="border-t border-white/5">
              {row.map((cell, i) => (
                <td key={i} className={cn('py-1.5', i > 0 && 'text-right tabular-nums')}>
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

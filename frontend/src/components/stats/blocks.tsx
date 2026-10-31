/** The statistics page's sections: each a dashboard Block holding a chart or
 *  a ranking, a note under it, and the same numbers as a table. */
'use client';

import { useState } from 'react';
import type { Counted } from '@/lib/api';
import { byYear, filled, median, months, stepped, total, years } from '@/lib/siteStats';
import { cn } from '@/lib/utils';
import { Block, Plot } from '@/components/dashboard/Block';
import { Columns, type Column } from '@/components/dashboard/Columns';
import { Ranking, type Ranked } from '@/components/dashboard/Ranking';
import { ChoiceMenu } from '@/components/ui/ChoiceMenu';
import { Segmented } from '@/components/ui/Segmented';

const KINDS = [
  { value: 'v', label: 'Visual novels' },
  { value: 'r', label: 'Releases' },
  { value: 'c', label: 'Characters' },
  { value: 'p', label: 'Producers' },
  { value: 's', label: 'Staff' },
];

const NOTE = 'mt-3 text-[0.6875rem] leading-snug text-muted';

/** When vndb's entries were created: one kind at a time, by year or month. */
export function Added({ added }: { added: Record<string, Counted[]> }) {
  const [kind, setKind] = useState('v');
  const [grain, setGrain] = useState<'year' | 'month'>('year');
  const monthly = added[kind] ?? [];
  const data = grain === 'month' ? months(monthly) : years(byYear(monthly));
  const name = KINDS.find(k => k.value === kind)?.label.toLowerCase() ?? 'entries';
  return (
    <Block
      title="Added to vndb"
      action={
        <div className="flex flex-wrap items-center justify-end gap-2">
          <ChoiceMenu label="Kind" value={kind} onChange={setKind} choices={KINDS} align="end" />
          <Segmented
            label="Count by"
            value={grain}
            onChange={setGrain}
            options={[
              { value: 'year', label: 'Year' },
              { value: 'month', label: 'Month' },
            ]}
          />
        </div>
      }
      table={{ head: [grain === 'year' ? 'Year' : 'Month', cap(name)], rows: rowsOf(data) }}
    >
      <Plot>
        <Columns data={data} unit={name} label={`${cap(name)} added by ${grain}`} />
        <p className={NOTE}>When each entry was created on vndb.</p>
      </Plot>
    </Block>
  );
}

/** Years up to this one; later ones are dates announced, said apart. */
export function Released({
  title,
  unit,
  counts,
  thisYear,
}: {
  title: string;
  unit: string;
  counts: Counted[];
  thisYear: number;
}) {
  const past = counts.filter(c => Number(c.key) <= thisYear);
  const later = total(counts) - total(past);
  return (
    <Chart
      title={title}
      unit={unit}
      head="Year"
      data={years(past)}
      note={
        later
          ? `${later.toLocaleString()} more ${unit} announced for after ${thisYear}.`
          : undefined
      }
    />
  );
}

/** A measurement of characters: a spread over a range, with its median and
 *  how many have one given at all. */
export function Measure({
  title,
  unit,
  head,
  counts,
  range: [from, to],
  step = 1,
  suffix,
  what,
}: {
  title: string;
  unit: string;
  head: string;
  counts: Counted[];
  range: [number, number];
  step?: number;
  suffix: string;
  what: string;
}) {
  const inside = counts.filter(c => Number(c.key) >= from && Number(c.key) < to + step);
  const outside = total(counts) - total(inside);
  const mid = median(counts);
  const data = filled(stepped(inside, step), from, to, step).map(c => ({
    ...c,
    title: step > 1 ? `${c.key}–${Number(c.key) + step - 1}${suffix}` : `${c.key}${suffix}`,
  }));
  return (
    <Chart
      title={title}
      unit={unit}
      head={head}
      data={data}
      note={
        mid === null
          ? `No ${unit} with ${what} given.`
          : `Median ${mid}${suffix}, of ${total(counts).toLocaleString()} ${unit} with ${what} given${
              outside ? `; ${outside.toLocaleString()} fall outside the chart` : ''
            }.`
      }
    />
  );
}

export function Chart({
  title,
  unit,
  head,
  data,
  note,
}: {
  title: string;
  unit: string;
  head: string;
  data: Column[];
  note?: string;
}) {
  return (
    <Block title={title} table={{ head: [head, cap(unit)], rows: rowsOf(data) }}>
      <Plot className="flex flex-col">
        <Columns data={data} unit={unit} label={`${cap(unit)} by ${head.toLowerCase()}`} />
        {note && <p className={NOTE}>{note}</p>}
      </Plot>
    </Block>
  );
}

export function List({
  title,
  head,
  rows,
  of,
  format,
  picked,
  note,
  action,
}: {
  title: string;
  head: string;
  rows: Ranked[] | undefined;
  of?: number;
  format?: (n: number) => string;
  /** A row to light, the rest dimmed. */
  picked?: string;
  note?: string;
  action?: React.ReactNode;
}) {
  return (
    <Block
      title={title}
      action={action}
      table={{
        head: [head, 'Count'],
        rows: (rows ?? []).map(r => [r.label, format ? format(r.count) : r.count]),
      }}
    >
      <Plot className="flex flex-col">
        <Ranking rows={rows} of={of} format={format} picked={picked} />
        {note && <p className={cn(NOTE, 'mt-auto pt-3')}>{note}</p>}
      </Plot>
    </Block>
  );
}

/** A ranking with a few views of it, one at a time. */
export function Choice({
  title,
  head,
  views,
  notes,
  of,
}: {
  title: string;
  head: string;
  views: Record<string, Ranked[]>;
  notes?: Record<string, string>;
  of?: number;
}) {
  const names = Object.keys(views);
  const [shown, setShown] = useState(names[0]);
  return (
    <List
      title={title}
      head={head}
      rows={views[shown]}
      of={of}
      note={notes?.[shown]}
      action={
        <Segmented
          label={`${title} by`}
          value={shown}
          onChange={setShown}
          options={names.map(n => ({ value: n, label: n }))}
        />
      }
    />
  );
}

/** A ranking per choice from a longer menu. */
export function Picked({
  title,
  head,
  label,
  choices,
  rows,
  note,
}: {
  title: string;
  head: string;
  label: string;
  choices: { value: string; label: string; count?: number }[];
  rows: (key: string) => Ranked[] | undefined;
  note?: string;
}) {
  const [picked, setPicked] = useState(choices[0]?.value ?? '');
  return (
    <List
      title={title}
      head={head}
      rows={rows(picked)}
      note={note}
      action={
        choices.length > 1 && (
          <ChoiceMenu
            label={label}
            value={picked}
            choices={choices}
            onChange={setPicked}
            align="end"
          />
        )
      }
    />
  );
}

function rowsOf(data: Column[]): (string | number)[][] {
  return data.map(d => [d.title, d.value]);
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

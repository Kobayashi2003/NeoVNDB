/** The dashboard's chart sections, one per thing the titles share. The first
 *  four count the titles' own fields and can be picked to narrow the page;
 *  the rest come from the read API's aggregate and are links. */
'use client';

import { useState } from 'react';
import type { VNStats } from '@/lib/api';
import { buckets, tally, type Detail, type Entry } from '@/lib/dashboard';
import { display } from '@/lib/format';
import { enumLabel } from '@/lib/enums';
import { ChoiceMenu } from '@/components/ui/ChoiceMenu';
import { Segmented } from '@/components/ui/Segmented';
import { Block, Plot } from './Block';
import { Columns, type Column } from './Columns';
import { Ranking } from './Ranking';

/** The credited roles worth a choice, in the order vndb lists them. */
const ROLES: { value: string; label: string }[] = [
  { value: 'scenario', label: 'Scenario' },
  { value: 'chardesign', label: 'Character design' },
  { value: 'art', label: 'Art' },
  { value: 'music', label: 'Music' },
  { value: 'director', label: 'Director' },
];
const CATEGORIES: { value: string; label: string }[] = [
  { value: 'cont', label: 'Content' },
  { value: 'tech', label: 'Technical' },
  { value: 'ero', label: 'Sexual' },
];

export function columnsOf(
  dates: string[],
  grain: 'year' | 'month',
  span?: Parameters<typeof buckets>[2],
): Column[] {
  return buckets(dates, grain, span).map(b => ({
    key: b.key,
    label: b.key,
    title: b.key,
    value: b.count,
  }));
}

interface Pickable<T> {
  picked?: T;
  onPick: (value: T | undefined) => void;
}

/** A numeric pick as the string key a chart's columns carry, and back. */
function asKey(pickable: Pickable<number>) {
  return {
    picked: pickable.picked === undefined ? undefined : String(pickable.picked),
    onPick: (key: string | undefined) => pickable.onPick(key === undefined ? key : Number(key)),
  };
}

export function ReleaseYears({ rows, ...pick }: { rows: Detail[] } & Pickable<string>) {
  const dated = rows.map(r => r.released).filter(d => /^\d{4}/.test(d));
  const data = columnsOf(dated, 'year');
  return (
    <Block
      title="Released in"
      table={{ head: ['Year', 'Titles'], rows: data.map(d => [d.key, d.value]) }}
    >
      <Plot>
        <Columns data={data} unit="titles" label="Titles by release year" {...pick} />
      </Plot>
    </Block>
  );
}

export function MyRatings({ scope, ...pick }: { scope: Entry[] } & Pickable<number>) {
  const data: Column[] = [1, 2, 3, 4, 5].map(n => ({
    key: String(n),
    label: '★'.repeat(n),
    title: `${n} star${n === 1 ? '' : 's'}`,
    value: scope.filter(e => e.rating === n).length,
  }));
  return (
    <Block
      title="Your ratings"
      table={{ head: ['Stars', 'Titles'], rows: data.map(d => [d.title, d.value]) }}
    >
      <Plot>
        <Columns data={data} unit="titles" label="Titles by your rating" {...asKey(pick)} />
      </Plot>
    </Block>
  );
}

export function Lengths({ rows, ...pick }: { rows: Detail[] } & Pickable<number>) {
  const data: Column[] = [1, 2, 3, 4, 5].map(n => ({
    key: String(n),
    label: enumLabel('LENGTH', n),
    title: enumLabel('LENGTH', n),
    value: rows.filter(r => r.length === n).length,
  }));
  return (
    <Block
      title="Length"
      table={{ head: ['Length', 'Titles'], rows: data.map(d => [d.title, d.value]) }}
    >
      <Plot>
        <Columns data={data} unit="titles" label="Titles by length" {...asKey(pick)} />
      </Plot>
    </Block>
  );
}

export function Languages({ rows, picked, onPick }: { rows: Detail[] } & Pickable<string>) {
  const counted = tally(rows.map(r => r.olang)).map(t => ({
    id: t.value,
    label: enumLabel('LANGUAGE', t.value),
    count: t.count,
  }));
  return (
    <Block
      title="Originally in"
      table={{ head: ['Language', 'Titles'], rows: counted.map(r => [r.label, r.count]) }}
    >
      <Plot>
        <Ranking rows={counted.slice(0, 7)} picked={picked} onPick={onPick} />
      </Plot>
    </Block>
  );
}

type Tallies = VNStats['developers'];

/** Tallies as ranking rows, each a link to who or what it counts. */
function ranked(tallies: Tallies | undefined, original: boolean) {
  return tallies?.map(t => ({
    id: t.id,
    href: `/${t.id}`,
    label: display(t.name, t.original, original),
    count: t.count,
  }));
}

function RankingBlock({
  title,
  head,
  rows,
  action,
}: {
  title: string;
  head: string;
  rows: ReturnType<typeof ranked>;
  action?: React.ReactNode;
}) {
  return (
    <Block
      title={title}
      action={action}
      table={{ head: [head, 'Titles'], rows: (rows ?? []).map(r => [r.label, r.count]) }}
    >
      <Plot>
        <Ranking rows={rows} />
      </Plot>
    </Block>
  );
}

export function TallyBlock({
  title,
  tallies,
  original,
}: {
  title: string;
  tallies: Tallies | undefined;
  original: boolean;
}) {
  return <RankingBlock title={title} head={title} rows={ranked(tallies, original)} />;
}

export function StaffBlock({
  staff,
  original,
}: {
  staff: VNStats['staff'] | undefined;
  original: boolean;
}) {
  const offered = ROLES.filter(r => staff?.[r.value]?.length);
  const [role, setRole] = useState('scenario');
  const shown = offered.some(r => r.value === role) ? role : (offered[0]?.value ?? role);
  return (
    <RankingBlock
      title="Staff"
      head="Person"
      rows={staff && ranked(staff[shown] ?? [], original)}
      action={
        offered.length > 1 && (
          <ChoiceMenu label="Role" value={shown} choices={offered} onChange={setRole} align="end" />
        )
      }
    />
  );
}

export function TagsBlock({
  tags,
  original,
  sexual,
}: {
  tags: VNStats['tags'] | undefined;
  original: boolean;
  /** Sexual tags are offered only at the explicit content level. */
  sexual: boolean;
}) {
  const offered = CATEGORIES.filter(c => (c.value !== 'ero' || sexual) && tags?.[c.value]?.length);
  const [cat, setCat] = useState('cont');
  const shown = offered.some(c => c.value === cat) ? cat : (offered[0]?.value ?? cat);
  return (
    <RankingBlock
      title="Tags"
      head="Tag"
      rows={
        tags &&
        (tags[shown] ?? []).map(t => ({
          id: t.id,
          href: `/${t.id}`,
          label: display(t.name, t.translation, original),
          count: t.count,
        }))
      }
      action={
        offered.length > 1 && (
          <Segmented label="Tag category" value={shown} onChange={setCat} options={offered} />
        )
      }
    />
  );
}

/** The whole database, counted: how much of each kind there is, when vndb's
 *  entries came in, and how their fields spread. Drawn with the reader
 *  dashboard's charts in groups a row of pills jumps between; the rankings
 *  are links, and the characters' charts follow one choice of sex. */
'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { BySex, Counted, CountedSite, Leader } from '@/lib/api';
import { enumLabel, type EnumGroup } from '@/lib/enums';
import { display } from '@/lib/format';
import {
  byYear,
  filled,
  median,
  months,
  ofSex,
  stepped,
  total,
  years,
  type Sex,
} from '@/lib/siteStats';
import { ROLE_ORDER } from '@/lib/characters';
import { cn } from '@/lib/utils';
import { usePrefs } from '@/hooks/usePrefs';
import { Block, Plot } from '@/components/dashboard/Block';
import { Columns, type Column } from '@/components/dashboard/Columns';
import { Ranking, type Ranked } from '@/components/dashboard/Ranking';
import { ChoiceMenu } from '@/components/ui/ChoiceMenu';
import { ControlLabel } from '@/components/ui/ControlLabel';
import { Group, GROUP } from '@/components/ui/Group';
import { SectionNav } from '@/components/ui/SectionNav';
import { Segmented } from '@/components/ui/Segmented';
import { surface } from '@/components/ui/Surface';

const KINDS = [
  { value: 'v', label: 'Visual novels' },
  { value: 'r', label: 'Releases' },
  { value: 'c', label: 'Characters' },
  { value: 'p', label: 'Producers' },
  { value: 's', label: 'Staff' },
];
/** Each total, and the page that lists what it counts. */
const TOTALS: [string, string, string][] = [
  ['v', 'Visual novels', '/v'],
  ['r', 'Releases', '/r'],
  ['c', 'Characters', '/c'],
  ['p', 'Producers', '/p'],
  ['s', 'Staff', '/s'],
  ['g', 'Tags', '/g'],
  ['i', 'Traits', '/i'],
];
const SEXES: { value: Sex; label: string }[] = [
  { value: 'all', label: 'Everyone' },
  { value: 'f', label: 'Female' },
  { value: 'm', label: 'Male' },
];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const BLOOD: Record<string, string> = { a: 'A', b: 'B', ab: 'AB', o: 'O' };
const KIND_OF_RELEASE: Record<string, string> = {
  official: 'Official',
  freeware: 'Freeware',
  patch: 'Patch',
  erotic: 'Erotic content',
  uncensored: 'Uncensored',
};

/** Two sections side by side from lg up, stretched to the taller (as the
 *  reader dashboard's PAIR). */
const PAIR =
  'grid gap-x-6 gap-y-8 lg:grid-cols-2 [&>section]:flex [&>section]:flex-col [&>section>:last-child]:flex-1 [&>section>:first-child]:min-h-7';

export function SiteStats({ counted: { stats: s } }: { counted: CountedSite }) {
  const { original } = usePrefs();
  const [sex, setSex] = useState<Sex>('all');
  const thisYear = new Date().getFullYear();
  const count = (key: string) => s.totals.find(t => t.key === key)?.count ?? 0;
  const leaders = (rows: Leader[] | undefined, translated = false): Ranked[] | undefined =>
    rows?.map(r => ({
      id: r.id,
      href: `/${r.id}`,
      label: translated && r.translation ? r.translation : display(r.name, r.original, original),
      count: r.count,
    }));
  const chars = (counts: BySex) => ofSex(counts, sex);
  const who = sex === 'all' ? 'characters' : `${sex === 'f' ? 'female' : 'male'} characters`;

  return (
    <>
      <SectionNav of={GROUP} />
      <div className="flex flex-col gap-14">
        <Group title="Overview">
          {/* Each a way into the list it counts. */}
          <ul className={surface('grid grid-cols-2 overflow-hidden sm:grid-cols-4 lg:grid-cols-7')}>
            {TOTALS.map(([key, label, href]) => (
              <li key={key}>
                <Link
                  href={href}
                  className="group flex h-full flex-col gap-1 p-4 outline-none transition-colors hover:bg-white/[0.04] focus-visible:bg-white/[0.07]"
                >
                  <span className="font-display text-2xl leading-none tracking-tight tabular-nums">
                    {count(key).toLocaleString()}
                  </span>
                  <span className="text-xs text-muted transition-colors group-hover:text-white">
                    {label}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          <Added added={s.added} />
        </Group>

        <Group title="Visual novels">
          <div className={PAIR}>
            <Released title="Released in" unit="titles" counts={s.vn_years} thisYear={thisYear} />
            <Chart
              title="Rating"
              unit="titles"
              head="Rating"
              data={filled(s.vn_ratings, lowest(s.vn_ratings), 95, 5).map(c => {
                const r = Number(c.key) / 10;
                return {
                  ...c,
                  label: r.toFixed(1),
                  title: `rated ${halfPoint(Number(c.key))}`,
                };
              })}
              note={`vndb's rating, of the ${total(s.vn_ratings).toLocaleString()} titles with enough votes for one. The median title is rated ${halfPoint(
                median(s.vn_ratings),
              )}.`}
            />
          </div>
          <div className={PAIR}>
            <Chart
              title="Length"
              unit="titles"
              head="Length"
              data={labelled(
                s.vn_lengths.filter(c => c.key !== '0'),
                k => enumLabel('LENGTH', k),
              )}
              note={`${valueOf(s.vn_lengths, '0').toLocaleString()} more with no length given.`}
            />
            <List
              title="Development"
              head="Status"
              rows={enumRows(s.vn_status, 'DEVSTATUS')}
              of={count('v')}
            />
          </div>
          <div className={PAIR}>
            <List
              title="Highest rated"
              head="Title"
              rows={leaders(s.vn_top_rated)}
              format={n => (n / 100).toFixed(2)}
              note="Of titles with 100 votes or more."
            />
            <List title="Most voted on" head="Title" rows={leaders(s.vn_most_voted)} />
          </div>
          <div className={PAIR}>
            <Choice
              title="Languages"
              head="Language"
              views={{
                Original: enumRows(s.vn_languages, 'LANGUAGE'),
                Releases: enumRows(s.release_languages, 'LANGUAGE'),
              }}
              notes={{
                Original: 'The language each title was first written in.',
                Releases: 'Releases in each language, translations included.',
              }}
            />
            <Choice
              title="Platforms"
              head="Platform"
              views={{
                Titles: enumRows(s.vn_platforms, 'PLATFORM'),
                Releases: enumRows(s.release_platforms, 'PLATFORM'),
              }}
              notes={{
                Titles: 'Titles with any release on each.',
                Releases: 'Releases on each.',
              }}
            />
          </div>
        </Group>

        <Group title="Releases">
          <div className={PAIR}>
            <Released
              title="Released in"
              unit="releases"
              counts={s.release_years}
              thisYear={thisYear}
            />
            <Chart
              title="Age rating"
              unit="releases"
              head="Minimum age"
              data={labelled(s.release_ages, k => (k === '0' ? 'All' : `${k}+`))}
              note={`Of the ${total(s.release_ages).toLocaleString()} releases with an age rating.`}
            />
          </div>
          <div className={PAIR}>
            <List
              title="Voiced"
              head="Voicing"
              rows={enumRows(s.release_voiced, 'VOICED')}
              of={total(s.release_voiced)}
            />
            <List
              title="Of every release"
              head="Kind"
              rows={s.release_kinds.map(c => ({
                id: c.key,
                label: KIND_OF_RELEASE[c.key] ?? c.key,
                count: c.count,
              }))}
              of={count('r')}
              note="Each counted on its own, so they add up to more than all."
            />
          </div>
          <List
            title="Engines"
            head="Engine"
            rows={s.release_engines.map(c => ({ id: c.key, label: c.key, count: c.count }))}
          />
        </Group>

        <Group title="Producers">
          <div className={PAIR}>
            <List
              title="Developers"
              head="Developer"
              rows={leaders(s.developers)}
              note="By the titles they made."
            />
            <List
              title="Publishers"
              head="Publisher"
              rows={leaders(s.publishers)}
              note="By the titles they published officially."
            />
          </div>
          <div className={PAIR}>
            <List
              title="Kind"
              head="Kind"
              rows={enumRows(s.producer_types, 'TYPE')}
              of={count('p')}
            />
            <List
              title="Language"
              head="Language"
              rows={enumRows(s.producer_languages, 'LANGUAGE')}
              of={count('p')}
            />
          </div>
        </Group>

        <Group
          title="Characters"
          action={
            <div className="flex items-center gap-1">
              <ControlLabel>Of</ControlLabel>
              <Segmented label="Characters of" value={sex} onChange={setSex} options={SEXES} />
            </div>
          }
        >
          <div className={PAIR}>
            <List
              title="Sex"
              head="Sex"
              rows={enumRows(s.char_sex, 'CHARACTER_SEX')}
              of={total(s.char_sex)}
              // Always everyone's; the choice above is lit in it.
              picked={sex === 'all' ? undefined : sex}
              note={`${(count('c') - total(s.char_sex)).toLocaleString()} more with no sex given.`}
            />
            <List
              title="Role"
              head="Role"
              // In the order a title lists its characters, whichever leads.
              rows={enumRows(
                ROLE_ORDER.map(role => ({ key: role, count: valueOf(chars(s.char_roles), role) })),
                'CHARACTER_ROLE',
              )}
              of={total(chars(s.char_roles))}
              note="A character with several titles counts once in each role it has."
            />
          </div>
          <div className={PAIR}>
            <Measure
              title="Age"
              unit={who}
              head="Age"
              counts={chars(s.char_ages)}
              range={[1, 60]}
              suffix=""
              what="an age"
            />
            <Measure
              title="Height"
              unit={who}
              head="Height (cm)"
              counts={chars(s.char_heights)}
              range={[100, 200]}
              step={5}
              suffix=" cm"
              what="a height"
            />
          </div>
          <div className={PAIR}>
            <Measure
              title="Bust"
              unit={who}
              head="Bust (cm)"
              counts={chars(s.char_bust)}
              range={[60, 120]}
              step={5}
              suffix=" cm"
              what="a bust measurement"
            />
            <Chart
              title="Cup size"
              unit={who}
              head="Cup"
              data={labelled(chars(s.char_cups), k => k)}
              note={given(total(chars(s.char_cups)), who, 'a cup size')}
            />
          </div>
          <div className={PAIR}>
            <Chart
              title="Birthday"
              unit={who}
              head="Month"
              data={filled(chars(s.char_birth_months), 1, 12).map(c => ({
                ...c,
                label: MONTHS[Number(c.key) - 1],
                title: `born in ${MONTHS[Number(c.key) - 1]}`,
              }))}
              note={given(total(chars(s.char_birth_months)), who, 'a birthday')}
            />
            <List
              title="Blood type"
              head="Blood type"
              rows={byCount(chars(s.char_blood)).map(c => ({
                id: c.key,
                label: BLOOD[c.key] ?? c.key,
                count: c.count,
              }))}
              of={total(chars(s.char_blood))}
              note={given(total(chars(s.char_blood)), who, 'a blood type')}
            />
          </div>
          <List
            title="Gender identity"
            head="Gender"
            rows={enumRows(s.char_gender, 'GENDER')}
            of={total(s.char_gender)}
            note={`Given apart from sex, only where it differs or is the point: ${total(s.char_gender).toLocaleString()} characters of every sex.`}
          />
        </Group>

        <Group title="Staff">
          <div className={PAIR}>
            <List
              title="Credited as"
              head="Role"
              rows={enumRows(s.staff_roles, 'STAFF_ROLE')}
              note="People credited at least once in each role."
            />
            <Picked
              title="Most credited"
              head="Person"
              label="Role"
              choices={s.staff_roles.map(r => ({
                value: r.key,
                label: enumLabel('STAFF_ROLE', r.key),
              }))}
              rows={key => leaders(s.staff_top[key])}
              note="By the titles credited."
            />
          </div>
          <div className={PAIR}>
            <List title="Voiced the most characters" head="Voice actor" rows={leaders(s.seiyuu)} />
            <Choice
              title="People"
              head="Person"
              views={{
                Gender: enumRows(s.staff_gender, 'GENDER'),
                Language: enumRows(s.staff_languages, 'LANGUAGE'),
              }}
              of={count('s')}
            />
          </div>
        </Group>

        <Group title="Tags and traits">
          <div className={PAIR}>
            <Picked
              title="Most used tags"
              head="Tag"
              label="Category"
              choices={s.tag_categories.map(c => ({
                value: c.key,
                label: enumLabel('CATEGORY', c.key),
                count: c.count,
              }))}
              rows={key => leaders(s.tags[key], true)}
              note="By the titles they are on, their children's included."
            />
            <Picked
              title="Most used traits"
              head="Trait"
              label="Group"
              choices={s.trait_groups.map(g => ({ value: g.id, label: g.translation ?? g.name }))}
              rows={key => leaders(s.traits[key], true)}
              note="By the characters who have them, their children's included."
            />
          </div>
          <List
            title="Characters per trait group"
            head="Group"
            rows={leaders(s.trait_groups, true)}
            of={count('c')}
            note="Characters with any trait in the group that is neither a spoiler nor a lie."
          />
        </Group>
      </div>
    </>
  );
}

/** When vndb's entries were created: one kind at a time, by year or month. */
function Added({ added }: { added: Record<string, Counted[]> }) {
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
function Released({
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
function Measure({
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

const NOTE = 'mt-3 text-[0.6875rem] leading-snug text-muted';

function Chart({
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

function List({
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
function Choice({
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
function Picked({
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

function enumRows(counts: Counted[], group: EnumGroup): Ranked[] {
  return counts.map(c => ({ id: c.key, label: enumLabel(group, c.key), count: c.count }));
}

function labelled(counts: Counted[], label: (key: string) => string): Column[] {
  return counts.map(c => ({
    key: c.key,
    label: label(c.key),
    title: label(c.key),
    value: c.count,
  }));
}

function rowsOf(data: Column[]): (string | number)[][] {
  return data.map(d => [d.title, d.value]);
}

/** A half-point step keyed ×10 (65) as the span it covers (6.5–6.99); the
 *  top one holds a 10 too. */
function halfPoint(key: number | null): string {
  if (key === null) return '—';
  const r = key / 10;
  return `${r.toFixed(1)}–${r >= 9.5 ? '10' : (r + 0.49).toFixed(2)}`;
}

/** Most first: counts added up across sexes keep the first sex's order. */
function byCount(counts: Counted[]): Counted[] {
  return [...counts].sort((a, b) => b.count - a.count);
}

/** The smallest numeric key, so a chart starts where its data does. */
function lowest(counts: Counted[]): number {
  return counts.length ? Math.min(...counts.map(c => Number(c.key))) : 0;
}

function valueOf(counts: Counted[], key: string): number {
  return counts.find(c => c.key === key)?.count ?? 0;
}

function given(n: number, who: string, what: string): string {
  return n
    ? `Of ${n.toLocaleString()} ${who} with ${what} given.`
    : `No ${who} with ${what} given.`;
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** The read API, described by itself: /meta/openapi is built from the tables
 *  that serve requests, so what this page lists is what a request can use.
 *  Filter labels and value forms come from the condition builder's list. */
import type { Metadata } from 'next';
import { openapi, type FieldSchema, type OpenAPI, type Operation } from '@/lib/api';
import { conditionOf, type Condition } from '@/lib/conditions';
import { LIST } from '@/lib/list';
import { TYPES } from '@/components/layout/shelves';

export const metadata: Metadata = { title: 'API - NeoVNDB' };

const CODE = 'rounded bg-white/[0.06] px-1 py-0.5 font-mono text-[0.8em]';
const TABLE = 'w-full min-w-[32rem] text-left text-xs';
const TH = 'border-b border-white/10 px-2 py-1.5 font-medium text-muted';
const TD = 'border-b border-white/5 px-2 py-1.5 align-top';

const EXAMPLE =
  'vn?fields=title,rating&sort=rating&reverse=true&f=' +
  encodeURIComponent('lang=en+tag=(search=school)');

export default async function ApiPage() {
  let doc: OpenAPI;
  try {
    doc = await openapi();
  } catch {
    return (
      <main className="mx-auto w-full max-w-page px-4 py-8 text-sm text-muted">
        The API is not answering, so it cannot describe itself right now.
      </main>
    );
  }
  const base = doc.servers[0]?.url ?? '/vndbserve';
  const listPaths = new Set(TYPES.map(l => `/${LIST[l].type}`));

  return (
    <main className="mx-auto flex w-full max-w-page flex-col gap-6 px-4 py-8 pb-12">
      <header className="flex flex-col gap-2">
        <h1 className="text-xl font-bold sm:text-2xl">{doc.info.title}</h1>
        <p className="text-sm text-muted">
          Read-only, JSON, at <code className={CODE}>{base}</code>. Serving dump{' '}
          <code className={CODE}>{doc.info.version}</code>. Machine-readable:{' '}
          <a href={`${base}/meta/openapi`} className="text-accent hover:underline">
            OpenAPI 3.1
          </a>
          .
        </p>
      </header>

      <section className="rounded-lg border border-white/5 bg-surface p-4">
        <h2 className="mb-2 text-sm font-semibold">Filters and conditions</h2>
        <pre className="whitespace-pre-wrap font-mono text-xs leading-relaxed text-white/80">
          {doc.info.description}
        </pre>
        <p className="mt-3 break-all text-xs text-muted">
          Example:{' '}
          <a href={`${base}/${EXAMPLE}`} className="font-mono text-accent hover:underline">
            {base}/{decodeURIComponent(EXAMPLE)}
          </a>
        </p>
      </section>

      {TYPES.map(letter => {
        const type = LIST[letter].type;
        const op = doc.paths[`/${type}`]?.get;
        const schema = doc.components.schemas[type];
        if (!op || !schema) return null;
        return (
          <TypeSection key={type} letter={letter} base={base} op={op} fields={schema.properties} />
        );
      })}

      <section className="rounded-lg border border-white/5 bg-surface p-4">
        <h2 className="mb-2 text-sm font-semibold">Other endpoints</h2>
        <ul className="flex flex-col gap-1.5 text-xs">
          {Object.entries(doc.paths)
            .filter(([path]) => !listPaths.has(path))
            .map(([path, { get }]) => (
              <li key={path}>
                <code className={CODE}>
                  GET {base}
                  {path}
                </code>{' '}
                <span className="text-muted">{get.summary}</span>
              </li>
            ))}
        </ul>
      </section>
    </main>
  );
}

function TypeSection({
  letter,
  base,
  op,
  fields,
}: {
  letter: string;
  base: string;
  op: Operation;
  fields: Record<string, FieldSchema>;
}) {
  const params = op.parameters ?? [];
  const filters = params.filter(p => p['x-filter']).map(p => p.name);
  const sorts = params.find(p => p.name === 'sort')?.schema?.enum ?? [];

  return (
    <details className="rounded-lg border border-white/5 bg-surface">
      <summary className="flex cursor-pointer flex-wrap items-baseline gap-x-3 gap-y-1 px-4 py-3">
        <span className="text-sm font-semibold">{LIST[letter].label}</span>
        <code className={CODE}>
          GET {base}/{LIST[letter].type}
        </code>
        <span className="text-xs text-muted">
          {Object.keys(fields).length} fields · {filters.length} filters · {sorts.length} sorts
        </span>
      </summary>
      <div className="flex flex-col gap-4 border-t border-white/5 px-4 py-3">
        <p className="flex flex-wrap gap-1 text-xs text-muted">
          Sorts:
          {sorts.map(s => (
            <code key={s} className={CODE}>
              {s}
            </code>
          ))}
        </p>

        <div className="overflow-x-auto">
          <table className={TABLE}>
            <thead>
              <tr>
                <th className={TH}>Filter</th>
                <th className={TH}>Meaning</th>
                <th className={TH}>Value</th>
              </tr>
            </thead>
            <tbody>
              {filters.map(name => {
                const cond = conditionOf(letter, name);
                return (
                  <tr key={name}>
                    <td className={TD}>
                      <code className={CODE}>{name}</code>
                    </td>
                    <td className={TD}>
                      {cond?.label ?? <span className="text-muted">text view only</span>}
                    </td>
                    <td className={`${TD} text-muted`}>{cond ? valueForm(cond) : ''}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="overflow-x-auto">
          <table className={TABLE}>
            <thead>
              <tr>
                <th className={TH}>Field</th>
                <th className={TH}>Holds</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(fields)
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([name, f]) => (
                  <tr key={name}>
                    <td className={TD}>
                      <code className={CODE}>{name}</code>
                    </td>
                    <td className={`${TD} text-muted`}>{fieldForm(f)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>
    </details>
  );
}

/** How a filter's value is written, from the builder's own description. */
function valueForm(c: Condition): string {
  switch (c.kind) {
    case 'enum': {
      const shown = c.choices
        .slice(0, 6)
        .map(ch => ch.value)
        .join(', ');
      return shown + (c.choices.length > 6 ? ', …' : '') + (c.ordered ? ' (comparable)' : '');
    }
    case 'bool':
      return 'true or false';
    case 'number':
      return `a number${c.unit ? ` in ${c.unit}` : ''}; =, !=, >, >=, <, <=`;
    case 'date':
      return '2020, 2020-05 or 2020-05-17; comparable';
    case 'text':
      return c.hint ?? 'text';
    case 'site':
      return 'a link site (see /meta/extlinks)';
    case 'resolution':
      return 'WxH, e.g. 1920x1080; =, !=, >=, <=';
    case 'credit':
      return 'a staff id, optionally with a role: s224 or s224:scenario';
    case 'entity':
      return `an id, e.g. ${c.target}17`;
    case 'scored':
      return c.score
        ? 'g749, g749:2.0 (minimum score), g749:2.0:1 (spoiler ceiling), or (tag conditions)'
        : 'i568 or i568:1 (spoiler ceiling), or (trait conditions)';
    case 'relation':
      return `an id (${c.target}17), or conditions on it in brackets`;
  }
}

function fieldForm(f: FieldSchema): string {
  if (f['x-expected'] === undefined) return 'a value';
  const target = f.$ref?.split('/').pop();
  const parts = [target ? `nests ${target}` : 'a group of values'];
  if (f['x-subfields']?.length) parts.push(`fields ${f['x-subfields'].join(', ')}`);
  if (f['x-edge']?.length) parts.push(`with ${f['x-edge'].join(', ')}`);
  return parts.join('; ');
}

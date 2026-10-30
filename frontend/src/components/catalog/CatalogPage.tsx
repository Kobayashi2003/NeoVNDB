/** Shell for the producer, staff, tag and trait pages: a short record beside
 *  a listing of what it applies to, using the type's own list (cards, sorts,
 *  paging). Tabs choose which listing; all state stays in the address. */

import Link from 'next/link';
import { ListFilter } from 'lucide-react';
import { asExpression } from '@/lib/conditions';
import { one, type Params } from '@/lib/href';
import { LIST } from '@/lib/list';
import { fetchResults } from '@/lib/results';
import { still } from '@/lib/viewTransitions';
import { DetailHeader, DetailShell } from '@/components/ui/DetailShell';
import { ResultsPanel } from '@/components/results/ResultsPanel';
import { Tabs, type Tab } from '@/components/results/Tabs';

export async function CatalogPage({
  title,
  subtitle,
  aside,
  action,
  tabs,
  path,
  params,
  empty,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  aside: React.ReactNode;
  action?: React.ReactNode;
  /** At least one. The first is the default and is left out of the address. */
  tabs: [Tab, ...Tab[]];
  path: string;
  params: Params;
  empty?: React.ReactNode;
}) {
  // A tab with nothing behind it is left out; a page whose every tab is
  // empty keeps the first, to say so.
  const offered = tabs.filter(t => t.count > 0);
  const shown = offered.length > 0 ? offered : [tabs[0]];
  const wanted = one(params, 'tab');
  const active = shown.find(t => t.value === wanted) ?? shown[0];
  const data = await fetchResults(active.type, params, active.filters);

  return (
    // Heading, record and tabs stay still across tabs and pages; the heading is
    // raised so its action's menu opens over the results.
    <DetailShell
      header={
        <div style={still(`head${path}`)} className="relative z-20">
          <DetailHeader title={title} subtitle={subtitle} action={action} />
        </div>
      }
      // Drawn twice by DetailShell, one always hidden; hidden elements are not
      // captured, so the name stays unique.
      aside={<div style={still(`aside${path}`)}>{aside}</div>}
    >
      <div style={still(`tabs${path}`)} className="flex flex-wrap items-center gap-2">
        <Tabs path={path} params={params} tabs={shown} active={active.value} />
        {/* The same list on the type's own page, as a condition that more can
            be added to. Pulled out by its padding: with no fill until hovered,
            its text is its edge, and that lines up with the list below. */}
        <Link
          href={`/${active.type}?f=${encodeURIComponent(asExpression(active.filters))}`}
          className="-mr-3 ml-auto inline-flex items-center gap-1 h-7 rounded-full px-3 text-xs text-muted transition-colors hover:bg-white/10 hover:text-white"
        >
          <ListFilter className="icon-text size-3" aria-hidden />
          Refine in {LIST[active.type].label}
        </Link>
      </div>
      <ResultsPanel
        type={active.type}
        path={path}
        params={params}
        data={data}
        empty={empty ?? 'Nothing here yet.'}
      />
    </DetailShell>
  );
}

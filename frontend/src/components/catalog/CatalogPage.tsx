/** Shell for the producer, staff, tag and trait pages: a short record beside
 *  a listing of what it applies to, using the type's own list (cards, sorts,
 *  paging). Tabs choose which listing; all state stays in the address. */

import Link from 'next/link';
import { ListFilter } from 'lucide-react';
import { asExpression } from '@/lib/conditions';
import { one, type Params } from '@/lib/href';
import { LIST } from '@/lib/list';
import { fetchResults } from '@/lib/results';
import { DetailHeader, DetailShell } from '@/components/ui/DetailShell';
import { ResultsPanel } from '@/components/list/ResultsPanel';
import { Tabs, type Tab } from '@/components/list/Tabs';

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
    <DetailShell
      header={<DetailHeader title={title} subtitle={subtitle} action={action} />}
      aside={<>{aside}</>}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Tabs path={path} params={params} tabs={shown} active={active.value} />
        {/* The same list on the type's own page, as a condition that more can
            be added to. */}
        <Link
          href={`/${active.type}?f=${encodeURIComponent(asExpression(active.filters))}`}
          className="ml-auto inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs text-muted transition-colors hover:bg-white/10 hover:text-white"
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

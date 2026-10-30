/** A catalogue page's tabs, as links. Switching resets page and sort, since
 *  they belonged to a different list. A client component for the arrow keys. */
'use client';

import Link from 'next/link';
import { rowKeys } from '@/lib/rowKeys';
import { pill } from '@/components/ui/Pill';
import { withParams, type Params } from '@/lib/href';

export interface Tab {
  /** The value of `?tab=`; the first one is also the default and is left out
   *  of the address. */
  value: string;
  label: string;
  count: number;
  /** The result type this tab lists. */
  type: string;
  filters: Record<string, string>;
}

export function Tabs({
  path,
  params,
  tabs,
  active,
}: {
  path: string;
  params: Params;
  tabs: Tab[];
  active: string;
}) {
  // One tab is not a choice, but it still says what is listed: shown as a
  // label rather than a link.
  if (tabs.length === 1) {
    return (
      <span className={pill({ tone: 'on', className: 'gap-1.5 hover:bg-white/20' })}>
        {tabs[0].label}
        <span className="tabular-nums text-muted">{tabs[0].count.toLocaleString()}</span>
      </span>
    );
  }

  return (
    <div className="flex flex-wrap gap-1" role="tablist" onKeyDown={rowKeys()}>
      {tabs.map((tab, i) => {
        const here = tab.value === active;
        const label = (
          <>
            {tab.label}
            <span className="tabular-nums text-muted">{tab.count.toLocaleString()}</span>
          </>
        );
        return (
          <Link
            key={tab.value}
            href={withParams(path, params, {
              tab: i === 0 ? null : tab.value,
              page: null,
              sort: null,
              reverse: null,
            })}
            role="tab"
            aria-selected={here}
            className={pill({ tone: here ? 'on' : 'quiet', className: 'gap-1.5' })}
          >
            {label}
          </Link>
        );
      })}
    </div>
  );
}

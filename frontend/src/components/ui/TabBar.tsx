/** A row of mutually exclusive filters, each carrying how many it would show. */
'use client';

import { rowKeys } from '@/lib/rowKeys';
import { pill } from './Pill';

export interface Tab {
  value: string;
  label: string;
  count?: number;
}

export function TabBar({
  tabs,
  active,
  onChange,
}: {
  tabs: Tab[];
  active: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1" role="tablist" onKeyDown={rowKeys({ choose: true })}>
      {tabs.map(tab => (
        <button
          key={tab.value}
          role="tab"
          aria-selected={active === tab.value}
          onClick={() => onChange(tab.value)}
          className={pill({ tone: active === tab.value ? 'on' : 'quiet', className: 'gap-1.5' })}
        >
          {tab.label}
          {tab.count !== undefined && <span className="text-muted">{tab.count}</span>}
        </button>
      ))}
    </div>
  );
}

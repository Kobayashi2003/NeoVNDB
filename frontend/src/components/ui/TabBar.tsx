/** A row of mutually exclusive filters, each carrying how many it would show. */
'use client';

import { cn } from '@/lib/utils';

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
    <div className="flex flex-wrap gap-1" role="tablist">
      {tabs.map(tab => (
        <button
          key={tab.value}
          role="tab"
          aria-selected={active === tab.value}
          onClick={() => onChange(tab.value)}
          className={cn(
            'rounded-full px-3 py-1 text-xs font-medium transition-colors',
            active === tab.value
              ? 'bg-white/20 text-white'
              : 'text-muted hover:bg-white/10 hover:text-white',
          )}
        >
          {tab.label}
          {tab.count !== undefined && <span className="ml-1.5 text-muted">{tab.count}</span>}
        </button>
      ))}
    </div>
  );
}

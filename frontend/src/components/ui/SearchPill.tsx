/** The rounded search field that searches on submit, not per keystroke: a
 *  list page's, a collection's and the header's. What differs between them
 *  goes in `before` (a label) and `after` (a clear link). */
'use client';

import { Search } from 'lucide-react';
import { cn } from '@/lib/utils';

export function SearchPill({
  name,
  initial = '',
  label,
  placeholder = 'Search',
  onSearch,
  autoFocus,
  role,
  className,
  before,
  after,
}: {
  name: string;
  initial?: string;
  label: string;
  placeholder?: string;
  onSearch: (term: string) => void;
  autoFocus?: boolean;
  role?: 'search';
  className?: string;
  before?: React.ReactNode;
  after?: React.ReactNode;
}) {
  return (
    <form
      role={role}
      onSubmit={e => {
        e.preventDefault();
        onSearch(String(new FormData(e.currentTarget).get(name) ?? ''));
      }}
      className={cn(
        'flex min-w-0 items-center gap-2 rounded-full border border-white/10 bg-surface px-3 py-1.5 transition-colors focus-within:border-white/30',
        className,
      )}
    >
      {before}
      <Search className="icon-text size-3.5 shrink-0 text-muted" aria-hidden />
      <input
        name={name}
        type="search"
        defaultValue={initial}
        autoFocus={autoFocus}
        placeholder={placeholder}
        aria-label={label}
        className="-my-1.5 min-w-0 flex-1 bg-transparent py-1.5 text-xs outline-none placeholder:text-muted"
      />
      {after}
    </form>
  );
}

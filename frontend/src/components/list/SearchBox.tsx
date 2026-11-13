/** A list page's search, applied on submit: names as the `search` filter, or,
 *  switched over, descriptions as `description` (a release's `notes`). */
'use client';

import { useState } from 'react';
import { FileText } from 'lucide-react';
import { useNavigate } from '@/hooks/useNavigate';
import { one, withParams, type Params } from '@/lib/href';
import { textKey } from '@/lib/list';
import { cn } from '@/lib/utils';
import { SearchPill } from '@/components/ui/SearchPill';

export function SearchBox({ type, path, params }: { type: string; path: string; params: Params }) {
  const router = useNavigate();
  const key = textKey(type);
  const names = one(params, 'search') ?? '';
  const text = one(params, key) ?? '';
  // Open on descriptions when that is what the address searches.
  const [inText, setInText] = useState(!names && !!text);
  const what = type === 'r' ? 'notes' : 'descriptions';

  return (
    <SearchPill
      // Keyed by the side, so switching starts from that side's own words.
      key={inText ? key : 'search'}
      name={inText ? key : 'search'}
      initial={inText ? text : names}
      label={inText ? `Search ${what}` : 'Search'}
      placeholder={inText ? `Search ${what}` : 'Search'}
      // A new search invalidates whatever page the reader was on, and one
      // side replaces the other.
      onSearch={term =>
        router.push(
          withParams(path, params, {
            search: inText ? null : term,
            [key]: inText ? term : null,
            page: null,
          }),
        )
      }
      after={
        <button
          type="button"
          onClick={() => setInText(!inText)}
          aria-pressed={inText}
          title={inText ? `Searching ${what}: switch to names` : `Search ${what} instead of names`}
          aria-label={`Search ${what}`}
          className={cn(
            '-mr-1 flex size-5 shrink-0 items-center justify-center rounded-full transition-colors',
            inText ? 'bg-accent/20 text-accent' : 'text-muted hover:text-white',
          )}
        >
          <FileText className="size-3.5" aria-hidden />
        </button>
      }
      className="w-full sm:w-auto"
    />
  );
}

/** A gap in the page links that turns into a page-number box when clicked,
 *  for the pages the window leaves out. */
'use client';

import { useState } from 'react';
import { useNavigate } from '@/components/layout/Navigation';
import { withParams, type Params } from '@/lib/href';
import { cn } from '@/lib/utils';

export function PageJump({
  path,
  params,
  last,
  className,
}: {
  path: string;
  params: Params;
  last: number;
  className: string;
}) {
  const router = useNavigate();
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Go to page…"
        aria-label="Go to page"
        className={cn(className, 'text-muted hover:bg-white/10 hover:text-white')}
      >
        &hellip;
      </button>
    );
  }

  return (
    // noValidate: an out-of-range number is clamped rather than refused.
    <form
      noValidate
      onSubmit={e => {
        e.preventDefault();
        const n = Math.round(Number(new FormData(e.currentTarget).get('page')));
        if (!Number.isFinite(n)) return;
        const page = Math.min(Math.max(n, 1), last);
        setOpen(false);
        router.push(withParams(path, params, { page: page === 1 ? null : page }));
      }}
    >
      <input
        name="page"
        type="number"
        min={1}
        max={last}
        autoFocus
        placeholder={`1–${last}`}
        aria-label={`Page, 1 to ${last}`}
        onBlur={() => setOpen(false)}
        onKeyDown={e => e.key === 'Escape' && setOpen(false)}
        className="h-8 w-20 rounded border border-white/10 bg-white/[0.06] px-2 text-xs tabular-nums text-white outline-none [appearance:textfield] [color-scheme:dark] placeholder:text-muted focus:border-white/30 [&::-webkit-inner-spin-button]:appearance-none"
      />
    </form>
  );
}

/** The advanced filter. Conditions read as a sentence of chips; clicking one
 *  edits it in a popover like the filter menus. The same tree can be written as
 *  f= text. Nothing reaches the address until Apply. */
'use client';

import { useEffect, useState } from 'react';
import { useNavigate } from '@/components/layout/Navigation';
import { Code2, Wand2 } from 'lucide-react';
import { ApiError, list } from '@/lib/api';
import { TIDY_RULES } from '@/lib/conditions';
import { group, type Group, outline, parse, print, tidy } from '@/lib/expr';
import { filtersOf, type Params, withParams } from '@/lib/href';
import { LIST } from '@/lib/list';
import { cn } from '@/lib/utils';
import { type Builder, BuilderContext, describe, prune, update } from './context';
import { ModeMenu } from './menus';
import { Flow } from './sentence';

/* --- Panel ------------------------------------------------------------------ */

export function ConditionBuilder({
  type,
  path,
  params,
  current,
}: {
  type: string;
  path: string;
  params: Params;
  /** The f= in the address. */
  current: string;
}) {
  const router = useNavigate();
  const [state, setState] = useState(() => {
    try {
      return { root: parse(current), text: current, error: null as string | null };
    } catch (e) {
      return { root: group(), text: current, error: describe(e) as string | null };
    }
  });
  const [opened, setOpened] = useState<string | null>(null);
  const [asText, setAsText] = useState(state.error !== null);
  const { root, text, error } = state;

  const commit = (next: Group, then: string | null) => {
    const kept = (prune(next, then, true) as Group) ?? group();
    setState({ root: kept, text: print(kept), error: null });
    setOpened(then);
  };
  const builder: Builder = {
    opened,
    open: id => commit(root, id),
    edit: (key, fn, then = opened) => commit((update(root, key, fn) as Group) ?? group(), then),
  };
  const setText = (next: string) => {
    try {
      setState({ root: parse(next), text: next, error: null });
    } catch (e) {
      setState(s => ({ ...s, text: next, error: describe(e) }));
    }
  };

  const tidied = tidy(root, type, TIDY_RULES);
  const untidy = !error && outline(tidied) !== outline(root);

  const expression = error ? null : text.trim();
  const preview = usePreview(type, params, expression);
  const changed = expression !== null && expression !== current.trim();

  return (
    <BuilderContext value={builder}>
      <div className="flex w-full basis-full flex-col rounded-xl border border-white/10 bg-surface">
        {asText && (
          <div className="flex flex-col gap-1.5 border-b border-white/5 p-3">
            <textarea
              value={text}
              onChange={e => setText(e.target.value)}
              spellCheck={false}
              rows={1}
              aria-label="Conditions as text"
              placeholder="Write conditions as text"
              className={cn(
                'min-h-8 w-full resize-none rounded-lg border bg-white/[0.04] px-3 py-1.5 font-mono text-xs leading-relaxed text-white outline-none [field-sizing:content] placeholder:font-sans placeholder:text-muted',
                error ? 'border-red-400/60' : 'border-white/10 focus:border-white/30',
              )}
            />
            <p
              className={cn('text-[0.6875rem]', error ? 'text-red-400' : 'text-muted')}
              role={error ? 'alert' : undefined}
            >
              {error ?? (
                <>
                  <code>,</code> or · <code>+</code> and · <code>!</code> not · <code>( )</code>{' '}
                  group · <code>&quot;…&quot;</code> quote · <code>release=(…)</code> about a
                  related item
                </>
              )}
            </p>
          </div>
        )}

        <div className="flex flex-col gap-2.5 p-3">
          <div className="flex items-center gap-1.5 text-xs text-muted">
            Show {LIST[type].label.toLowerCase()} matching
            <ModeMenu node={root} />
            of these:
          </div>
          <Flow type={type} node={root} top />
        </div>

        <div className="flex flex-wrap items-center justify-end gap-1 border-t border-white/5 px-3 py-2 text-xs">
          <span className="mr-auto tabular-nums text-muted" aria-live="polite">
            {preview}
          </span>
          <button
            type="button"
            onClick={() => commit(tidied, null)}
            disabled={!untidy}
            title="Merge, flatten and simplify without changing the results"
            aria-label="Tidy"
            className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-muted sm:px-3 transition-colors hover:bg-white/10 hover:text-white disabled:pointer-events-none disabled:opacity-40"
          >
            <Wand2 className="icon-text size-3.5" aria-hidden />
            <span className="hidden sm:inline">Tidy</span>
          </button>
          <button
            type="button"
            onClick={() => setAsText(t => !t)}
            aria-pressed={asText}
            aria-label="Edit as text"
            title="Edit as text"
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 transition-colors sm:px-3',
              asText ? 'bg-white/10 text-white' : 'text-muted hover:bg-white/10 hover:text-white',
            )}
          >
            <Code2 className="icon-text size-3.5" aria-hidden />
            <span className="hidden sm:inline">Text</span>
          </button>
          {current && (
            <button
              type="button"
              onClick={() => router.push(withParams(path, params, { f: null, page: null }))}
              className="rounded-full px-3 py-1 text-muted transition-colors hover:bg-white/10 hover:text-white"
            >
              Clear
            </button>
          )}
          <button
            type="button"
            disabled={expression === null || !changed}
            onClick={() =>
              router.push(withParams(path, params, { f: expression || null, page: null }))
            }
            className="ml-1 rounded-full bg-accent px-3.5 py-1 font-medium text-black transition-colors hover:bg-accent-hover disabled:bg-white/10 disabled:text-muted"
          >
            Apply
          </button>
        </div>
      </div>
    </BuilderContext>
  );
}

/** Live match count for the expression, alongside the page's other filters. */
function usePreview(type: string, params: Params, expression: string | null): string {
  const [answer, setAnswer] = useState<{ for: string; text: string } | null>(null);

  useEffect(() => {
    if (expression === null) return;
    let live = true;
    const timer = setTimeout(() => {
      // The address's own f= is what is being edited: the draft replaces it.
      const filters = filtersOf(params);
      delete filters.f;
      if (expression) filters.f = expression;
      list(LIST[type].type, { fields: 'id', limit: 1, filters }).then(
        page =>
          live && setAnswer({ for: expression, text: `${page.count.toLocaleString()} matches` }),
        e =>
          live &&
          setAnswer({
            for: expression,
            text: e instanceof ApiError && e.status === 400 ? e.message : 'Could not count',
          }),
      );
    }, 400);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [type, params, expression]);

  if (expression === null) return '';
  return answer?.for === expression ? answer.text : 'Counting…';
}

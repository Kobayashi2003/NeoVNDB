/** A listing's searches to come back to: the ones the reader named, kept on
 *  their account, and this device's recent ones. A search is the listing's
 *  address less its page (lib/searches.ts), so opening one is a link. */
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Bookmark, History, Loader2, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Params } from '@/lib/href';
import { describe, forgetRecent, queryOf, recent, remember } from '@/lib/searches';
import { deleteSearch, errorText, saveSearch, savedSearches, type SavedSearch } from '@/lib/user';
import { MenuDivider, MenuLabel, MenuPanel, menuAction, menuItem } from '@/components/ui/Menu';
import { NewList } from '@/components/user/NewList';
import { useMenu } from '@/hooks/useMenu';
import { useSession } from '@/hooks/useSession';

/** Ordering alone is not a search worth remembering. */
const ORDER = new Set(['sort', 'reverse']);

export function SavedSearches({ type, params }: { type: string; params: Params }) {
  const session = useSession();
  const signedIn = session.status === 'in';
  const query = queryOf(params);
  const href = (q: string) => (q ? `/${type}?${q}` : `/${type}`);

  const [open, setOpen] = useState(false);
  const { box, panel } = useMenu(open, setOpen);
  const [named, setNamed] = useState<SavedSearch[] | null>(null);
  const [past, setPast] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Every listing visited with something narrowing it is a recent search.
  useEffect(() => {
    if ([...new URLSearchParams(query).keys()].some(k => !ORDER.has(k))) remember(type, query);
  }, [type, query]);

  // Re-read on every open: another device may have named one meanwhile.
  async function reveal() {
    setOpen(true);
    setError(null);
    setPast(recent(type).filter(q => q !== query));
    if (!signedIn) return;
    setNamed(null);
    try {
      setNamed(await savedSearches(type));
    } catch (err) {
      setError(errorText(err));
      setNamed([]);
    }
  }

  async function name(label: string) {
    const made = await saveSearch(type, label, query);
    setNamed(now =>
      [...(now ?? []), made].sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }),
      ),
    );
  }

  async function drop(search: SavedSearch) {
    setError(null);
    setNamed(now => now?.filter(s => s.id !== search.id) ?? null);
    try {
      await deleteSearch(search.id);
    } catch (err) {
      setError(errorText(err));
      setNamed(now => [...(now ?? []), search]);
    }
  }

  const here = named?.find(s => s.query === query);

  return (
    <div ref={box} className="relative shrink-0">
      <button
        type="button"
        onClick={() => (open ? setOpen(false) : reveal())}
        aria-expanded={open}
        aria-label="Saved searches"
        title="Saved searches"
        className={cn(
          'inline-flex h-full items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors',
          open ? 'bg-white/20 text-white' : 'bg-white/10 text-white hover:bg-white/15',
        )}
      >
        <Bookmark className="icon-text size-3.5" aria-hidden />
        <span className="hidden sm:inline">Saved</span>
      </button>

      {open && (
        // Fixed width: the save row becomes a text field and must not resize it.
        <MenuPanel ref={panel} align="end" scroll className="w-72">
          {signedIn ? (
            <>
              <MenuLabel icon={<Bookmark className="size-2.5" aria-hidden />}>
                Saved searches
              </MenuLabel>
              {named === null ? (
                <p className="flex items-center gap-2 px-2.5 py-1.5 text-xs text-muted">
                  <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
                  Reading your searches
                </p>
              ) : (
                <>
                  {named.map(s => (
                    <div key={s.id} className="group flex items-center">
                      <Link
                        href={href(s.query)}
                        onClick={() => setOpen(false)}
                        aria-current={s.query === query ? 'page' : undefined}
                        title={describe(s.query)}
                        className={menuItem({
                          current: s.query === query,
                          className: 'min-w-0 flex-1',
                        })}
                      >
                        <span className="truncate">{s.name}</span>
                      </Link>
                      <button
                        type="button"
                        onClick={() => drop(s)}
                        aria-label={`Delete ${s.name}`}
                        className="shrink-0 rounded p-1 text-muted transition-colors hover:bg-white/10 hover:text-white"
                      >
                        <X className="h-3.5 w-3.5" aria-hidden />
                      </button>
                    </div>
                  ))}
                  {named.length === 0 && !error && (
                    <p className="px-2.5 py-1.5 text-xs text-muted">None for this yet.</p>
                  )}
                  {query && !here && (
                    <NewList
                      onCreate={name}
                      onError={setError}
                      label="Save this search"
                      placeholder="Name"
                      field="Search name"
                      submit="Save search"
                    />
                  )}
                </>
              )}
            </>
          ) : (
            <p className="px-2.5 py-1.5 text-xs text-muted">
              <Link href="/login" className="text-accent hover:underline">
                Sign in
              </Link>{' '}
              to name searches and find them on any device.
            </p>
          )}

          {error && (
            <p role="alert" className="px-2.5 py-1.5 text-xs text-red-400">
              {error}
            </p>
          )}

          {past.length > 0 && (
            <>
              <MenuDivider />
              <MenuLabel
                icon={<History className="size-2.5" aria-hidden />}
                action={
                  <button
                    type="button"
                    onClick={() => {
                      forgetRecent(type);
                      setPast([]);
                    }}
                    className={menuAction}
                  >
                    Clear
                  </button>
                }
              >
                Recent on this device
              </MenuLabel>
              {past.map(q => (
                <Link
                  key={q}
                  href={href(q)}
                  onClick={() => setOpen(false)}
                  className={menuItem({ className: 'block truncate' })}
                >
                  {describe(q)}
                </Link>
              ))}
            </>
          )}
        </MenuPanel>
      )}
    </div>
  );
}

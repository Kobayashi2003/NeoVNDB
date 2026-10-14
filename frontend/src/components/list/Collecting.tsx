/** Saving results to the reader's lists from any page of results: "Select"
 *  turns the cards into checkboxes, and a bar at the foot saves the chosen
 *  ones to a list of that type. Only one set of results selects at a time, so
 *  a page with several (search) never stacks two bars. */
'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Bookmark, ListChecks, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { MenuLabel, MenuPanel, menuItem } from '@/components/ui/Menu';
import { ActionBar } from '@/components/ui/Selection';
import { NewList } from '@/components/user/NewList';
import { addMarks, collections, createCollection, errorText, type Collection } from '@/lib/user';
import { useSession } from '@/hooks/useSession';
import { useMenu } from '@/hooks/useMenu';

interface Selection {
  selecting: boolean;
  chosen: string[];
  start: () => void;
  stop: () => void;
  toggle: (id: string) => void;
  /** The ids on the page now, for "select this page". */
  showing: (ids: string[]) => void;
}

const Context = createContext<Selection | null>(null);

/** What the cards read; null outside a Collecting, or when not selecting. */
export function useSelection(): Selection | null {
  const s = useContext(Context);
  return s?.selecting ? s : null;
}

/** Stops whichever other set of results is selecting. */
let stopCurrent: (() => void) | null = null;

export function Collecting({ type, children }: { type: string; children: React.ReactNode }) {
  const signedIn = useSession().status === 'in';
  const [selecting, setSelecting] = useState(false);
  const [chosen, setChosen] = useState<string[]>([]);
  const [page, setPage] = useState<string[]>([]);

  const stop = useCallback(() => {
    setSelecting(false);
    setChosen([]);
  }, []);

  useEffect(
    () => () => {
      if (stopCurrent === stop) stopCurrent = null;
    },
    [stop],
  );

  const value = useMemo<Selection>(
    () => ({
      selecting: selecting && signedIn,
      chosen,
      start: () => {
        if (stopCurrent !== stop) stopCurrent?.();
        stopCurrent = stop;
        setSelecting(true);
      },
      stop,
      toggle: id => setChosen(now => (now.includes(id) ? now.filter(x => x !== id) : [...now, id])),
      showing: setPage,
    }),
    [selecting, signedIn, chosen, stop],
  );

  const allOnPage = page.length > 0 && page.every(id => chosen.includes(id));

  return (
    <Context.Provider value={value}>
      {children}
      {value.selecting && (
        <SaveBar
          type={type}
          chosen={chosen}
          allOnPage={allOnPage}
          canSelectPage={page.length > 0}
          onAll={() =>
            setChosen(now =>
              allOnPage ? now.filter(id => !page.includes(id)) : [...new Set([...now, ...page])],
            )
          }
          onSaved={() => setChosen([])}
          onClose={stop}
        />
      )}
    </Context.Provider>
  );
}

/** The button that starts selecting; nothing when signed out. `data-select`
 *  lets a row that is otherwise hidden on phones show for it. */
export function SelectToggle() {
  const s = useContext(Context);
  const signedIn = useSession().status === 'in';
  if (!s || !signedIn) return null;

  return (
    <button
      type="button"
      data-select
      onClick={s.selecting ? s.stop : s.start}
      aria-pressed={s.selecting}
      title={s.selecting ? 'Done selecting' : 'Select results to save them to a list'}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors',
        s.selecting ? 'bg-accent text-background' : 'text-muted hover:bg-white/10 hover:text-white',
      )}
    >
      <ListChecks className="icon-text size-3.5 shrink-0" aria-hidden />
      {s.selecting ? 'Selecting' : 'Select'}
    </button>
  );
}

function SaveBar({
  type,
  chosen,
  allOnPage,
  canSelectPage,
  onAll,
  onSaved,
  onClose,
}: {
  type: string;
  chosen: string[];
  allOnPage: boolean;
  canSelectPage: boolean;
  onAll: () => void;
  onSaved: () => void;
  onClose: () => void;
}) {
  const [picking, setPicking] = useState(false);
  const [lists, setLists] = useState<Collection[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const { box, panel: menu } = useMenu(picking, setPicking);

  // Re-read on every open: another tab may have changed the lists.
  async function reveal() {
    setPicking(true);
    setError(null);
    try {
      setLists(await collections(type));
    } catch (err) {
      setError(errorText(err));
      setLists([]);
    }
  }

  async function saveTo(list: Collection) {
    setPicking(false);
    setBusy(true);
    setError(null);
    try {
      const { changed } = await addMarks(list.id, chosen);
      const already = chosen.length - changed;
      setNote(
        `Saved ${changed} to “${list.name}”` + (already > 0 ? ` (${already} already there)` : ''),
      );
      setLists(
        now => now?.map(l => (l.id === list.id ? { ...l, count: l.count + changed } : l)) ?? null,
      );
      onSaved();
    } catch (err) {
      setError(errorText(err));
    }
    setBusy(false);
  }

  async function create(name: string) {
    const made = await createCollection(type, name);
    await saveTo({ ...made, count: 0 });
  }

  return (
    <ActionBar
      error={error}
      note={note}
      chosen={chosen.length}
      allOnPage={allOnPage}
      canSelectPage={canSelectPage && !busy}
      onAll={onAll}
      onClose={onClose}
    >
      <div ref={box} className="relative">
        <button
          type="button"
          onClick={() => (picking ? setPicking(false) : reveal())}
          disabled={chosen.length === 0 || busy}
          aria-expanded={picking}
          className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs transition-colors hover:bg-white/10 disabled:opacity-40"
        >
          {busy ? (
            <Loader2 className="icon-text h-4 w-4 shrink-0 animate-spin" aria-hidden />
          ) : (
            <Bookmark className="icon-text h-4 w-4 shrink-0" aria-hidden />
          )}
          Save to…
        </button>

        {picking && (
          // Upward, and fixed width: the last row becomes a text field.
          <MenuPanel ref={menu} above scroll className="w-60">
            <MenuLabel>Save to</MenuLabel>
            {lists === null ? (
              <p className="flex items-center gap-2 px-2.5 py-1.5 text-xs text-muted">
                <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
                Reading your lists
              </p>
            ) : (
              <>
                {lists.map(list => (
                  <button
                    key={list.id}
                    type="button"
                    onClick={() => saveTo(list)}
                    className={menuItem()}
                  >
                    <span className="min-w-0 flex-1 truncate">{list.name}</span>
                    <span className="shrink-0 tabular-nums text-muted">{list.count}</span>
                  </button>
                ))}
                {lists.length === 0 && (
                  <p className="px-2.5 py-1.5 text-xs text-muted">No lists for this yet.</p>
                )}
                <NewList onCreate={create} onError={setError} />
              </>
            )}
          </MenuPanel>
        )}
      </div>
    </ActionBar>
  );
}

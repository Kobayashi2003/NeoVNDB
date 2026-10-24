'use client';

import { useState } from 'react';
import { errorText } from '@/lib/user';

/** What the bulk-action bar is given to work with. */
export interface Choosing {
  chosen: string[];
  here: string[];
  allOnPage: boolean;
  busy: boolean;
  error: string | null;
  onAll: () => void;
  /** Runs a change, then clears the choice and reads the page again. */
  act: (change: () => Promise<unknown>) => Promise<void>;
  onClose: () => void;
}

/** Choosing saved items for one bulk action. The choice is kept with the set
 *  it was made on (`sourceKey`), so moving to another set ends it without an
 *  effect to reset it. Paging, ordering and searching keep it: a choice can be
 *  gathered across pages, as on a page of results. `here` is the ids on the
 *  page now; `changed` is called after an action went through. */
export function useShelfChoice(sourceKey: string, here: string[], changed: () => void) {
  const [selecting, setSelecting] = useState<string | null>(null);
  const [choice, setChoice] = useState<{ where: string; ids: string[] }>({ where: '', ids: [] });
  const [busy, setBusy] = useState(false);
  const [trouble, setTrouble] = useState<string | null>(null);

  const chosen = choice.where === sourceKey ? choice.ids : [];
  const allOnPage = here.length > 0 && here.every(x => chosen.includes(x));
  const choose = (ids: string[]) => setChoice({ where: sourceKey, ids });

  async function act(change: () => Promise<unknown>) {
    setBusy(true);
    setTrouble(null);
    try {
      await change();
      choose([]);
      changed();
    } catch (err) {
      setTrouble(errorText(err));
    }
    setBusy(false);
  }

  const bar: Choosing = {
    chosen,
    here,
    allOnPage,
    busy,
    error: trouble,
    // This page in or out; what was chosen on other pages stays.
    onAll: () =>
      choose(
        allOnPage ? chosen.filter(id => !here.includes(id)) : [...new Set([...chosen, ...here])],
      ),
    act,
    onClose: () => {
      setSelecting(null);
      choose([]);
      setTrouble(null);
    },
  };

  return {
    selecting: selecting === sourceKey,
    start: () => setSelecting(sourceKey),
    chosen,
    toggle: (id: string) =>
      choose(chosen.includes(id) ? chosen.filter(x => x !== id) : [...chosen, id]),
    bar,
  };
}

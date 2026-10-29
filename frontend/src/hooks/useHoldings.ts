/** Everything the signed-in reader holds of visual novels: every list with
 *  every mark on it, and every rating, read once for the dashboard. */
'use client';

import { useEffect, useState } from 'react';
import {
  collections,
  errorText,
  items,
  ratedItems,
  type Collection,
  type Mark,
  type Rated,
} from '@/lib/user';

export interface Holdings {
  lists: { list: Collection; marks: Mark[] }[];
  rated: Rated[];
}

export function useHoldings(): { held: Holdings | null; error: string | null } {
  const [held, setHeld] = useState<Holdings | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    (async () => {
      const [lists, rated] = await Promise.all([
        collections('v'),
        ratedItems('v', { sort: 'rated', ascending: false }),
      ]);
      const marks = await Promise.all(
        lists.map(l => items(l.id, { sort: 'added', ascending: false }).then(r => r.items)),
      );
      return { lists: lists.map((list, i) => ({ list, marks: marks[i] })), rated: rated.items };
    })().then(
      got => live && setHeld(got),
      err => live && setError(errorText(err)),
    );
    return () => {
      live = false;
    };
  }, []);

  return { held, error };
}

/** A name in the reader's chosen script. Pages render on the server, so the
 *  choice between the pair is made here on the client. */
'use client';

import { display } from '@/lib/format';
import { usePrefs } from '@/hooks/usePrefs';

export function Name({
  name,
  original,
  fallback,
}: {
  name: string | null;
  original: string | null;
  /** Shown when the entity has neither, which for a few rows it does not. */
  fallback?: string;
}) {
  const { original: prefer } = usePrefs();
  return <>{display(name, original, prefer) || fallback || ''}</>;
}

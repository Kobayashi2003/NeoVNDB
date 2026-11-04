/** How the read API answers this reader: in full, or masked to all ages (a
 *  guest always; everyone while the administrator says so). Asked once per
 *  page by the root layout; what is masked never reaches the page at all, so
 *  this only lets the page say why, and stop offering what cannot be shown. */
'use client';

import { createContext, useContext, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import type { Viewer } from '@/lib/api';
import { useSession } from './useSession';

const Rendered = createContext<Viewer>({ masked: false, reason: null });

export function ViewerRendered({ value, children }: { value: Viewer; children: React.ReactNode }) {
  return (
    <Rendered value={value}>
      <FollowSession />
      {children}
    </Rendered>
  );
}

export function useViewer(): Viewer {
  return useContext(Rendered);
}

/** Signing in or out changes what the read API shows, but the layout that
 *  asked is kept across navigations: the server tree is drawn again, as the
 *  new viewer. Not on the first answer, which only confirms the cookie the
 *  page was drawn with. */
function FollowSession() {
  const { status } = useSession();
  const router = useRouter();
  const seen = useRef(status);
  useEffect(() => {
    const was = seen.current;
    seen.current = status;
    if (was !== 'unknown' && status !== 'unknown' && was !== status) router.refresh();
  }, [status, router]);
  return null;
}

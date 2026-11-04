/** @vitest-environment jsdom */
import { act, render, renderHook, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ViewMenu } from '@/components/layout/ViewMenu';
import { usePrefs } from '@/hooks/usePrefs';
import { ViewerRendered } from '@/hooks/useViewer';
import { PREFS_COOKIE } from '@/lib/prefs';
import { readShelf, type OwnSort, type ShelfSource } from '@/lib/shelf';
import type { Viewer } from '@/lib/api';

/** Answers the read API's id lookups from `answer`, and the user service's
 *  session (which the viewer follows) with nobody. */
function apis(answer: (ids: string[]) => object) {
  const fetch = vi.fn(async (input: string | URL | Request) => {
    const url = new URL(String(input), 'http://x');
    if (url.pathname === '/userserve/session') return new Response('{"user":null}');
    return new Response(JSON.stringify(answer((url.searchParams.get('id') ?? '').split(','))));
  });
  vi.stubGlobal('fetch', fetch);
  return fetch;
}

const inMode = (viewer: Viewer) =>
  function Wrapper({ children }: { children: React.ReactNode }) {
    return <ViewerRendered value={viewer}>{children}</ViewerRendered>;
  };

beforeEach(() => apis(() => ({ results: [], count: 0, more: false })));
afterEach(() => {
  vi.unstubAllGlobals();
  document.cookie = `${PREFS_COOKIE}=; max-age=0`;
});

describe('all-ages mode in the content menu', () => {
  it('offers no levels to choose, and says why', async () => {
    const { unmount } = render(<ViewMenu />, {
      wrapper: inMode({ masked: true, reason: 'guest' }),
    });
    await userEvent.click(screen.getByRole('button', { name: 'What to show' }));
    expect(screen.queryByRole('radiogroup', { name: 'Sexual content' })).toBeNull();
    expect(screen.getByText(/Sign in to choose what else to see/)).toBeInTheDocument();
    // Spoilers are still the reader's to set.
    expect(screen.getByRole('radiogroup', { name: 'Spoilers' })).toBeInTheDocument();
    unmount();

    render(<ViewMenu />, { wrapper: inMode({ masked: true, reason: 'site' }) });
    await userEvent.click(screen.getByRole('button', { name: 'What to show' }));
    expect(screen.getByText(/An administrator has set this site/)).toBeInTheDocument();
  });

  it('holds the levels at the strictest, and keeps the reader’s own for later', () => {
    const open = renderHook(() => usePrefs(), { wrapper: inMode({ masked: false, reason: null }) });
    act(() => open.result.current.set({ sexual: 'explicit', violence: 'brutal' }));
    expect(open.result.current).toMatchObject({ sexual: 'explicit', violence: 'brutal' });

    const masked = renderHook(() => usePrefs(), {
      wrapper: inMode({ masked: true, reason: 'guest' }),
    });
    expect(masked.result.current).toMatchObject({
      sexual: 'safe',
      violence: 'tame',
      explicit: false,
    });
    // Kept as chosen, so it is there again once the mask comes off.
    expect(decodeURIComponent(document.cookie)).toContain('"sexual":"explicit"');
    act(() => open.result.current.set({ sexual: 'safe', violence: 'tame' }));
  });
});

describe('a shelf in all-ages mode', () => {
  const own: OwnSort[] = [{ value: 'added', label: 'Added', by: 'added' }];
  const saved = [
    { id: 'v100', rating: null, at: '2026-11-01' },
    { id: 'v101', rating: 8, at: '2026-11-02' },
    { id: 'v999', rating: null, at: '2026-11-03' },
  ];
  const source: ShelfSource = {
    page: async () => ({ rows: saved, count: saved.length }),
    all: async () => ({ items: saved, count: saved.length }),
  };
  // v100 is held back; v999 is no longer in the mirror at all.
  const answer = () => ({ results: [{ id: 'v101' }], count: 1, more: false, withheld: ['v100'] });

  it('leaves held-back entries out, and counts them apart from gone ones', async () => {
    apis(answer);
    const page = await readShelf({
      type: 'v',
      source,
      own,
      sort: 'added',
      reverse: false,
      search: '',
      page: 1,
    });
    expect(page.rows.map(r => r.id)).toEqual(['v101', 'v999']);
    expect(page.rows[1]).toMatchObject({ gone: true });
    expect(page.withheld).toBe(1);
  });

  it('does not call held-back entries missing when vndb orders the list', async () => {
    apis(answer);
    const page = await readShelf({
      type: 'v',
      source,
      own,
      sort: 'title',
      reverse: false,
      search: '',
      page: 1,
    });
    expect(page.withheld).toBe(1);
    expect(page.missing).toBe(1);
  });
});

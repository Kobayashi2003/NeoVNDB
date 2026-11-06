/** @vitest-environment jsdom */
import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useHoldings } from '@/hooks/useHoldings';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useHoldings', () => {
  // The user service hands over a whole list only so far
  // (NEOVNDB_USERS_MAX_ITEMS); what it left out was once counted as nothing.
  it('says how much of a long list and of the ratings was not read', async () => {
    const mark = (n: number) => ({ id: `v${n}`, marked_at: '2026-01-01T00:00:00Z', rating: null });
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request) => {
        const path = new URL(String(input), 'http://x').pathname;
        if (path === '/userserve/collections')
          return Response.json({
            results: [{ id: 1, type: 'v', name: 'Played', count: 5, created_at: '' }],
          });
        if (path === '/userserve/collections/1/items')
          return Response.json({ items: [mark(1), mark(2)], count: 5 });
        return Response.json({
          items: [{ id: 'v1', rating: 4, rated_at: '2026-01-01T00:00:00Z' }],
          count: 2,
        });
      }),
    );
    const { result } = renderHook(() => useHoldings());
    await waitFor(() => expect(result.current.held).not.toBeNull());
    expect(result.current.held).toMatchObject({ ratedCount: 2, unread: 3 + 1 });
    expect(result.current.held!.lists[0].marks).toHaveLength(2);
  });
});

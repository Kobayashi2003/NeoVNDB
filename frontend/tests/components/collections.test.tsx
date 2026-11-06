/** @vitest-environment jsdom */
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { forgetCollections, refreshCollections, useCollections } from '@/hooks/useCollections';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useCollections', () => {
  // Read just before signing out, the last reader's lists came back after it.
  it('drops an answer that comes after the lists were forgotten', async () => {
    let answer: () => void = () => {};
    vi.stubGlobal(
      'fetch',
      vi.fn(
        () =>
          new Promise<Response>(resolve => {
            answer = () =>
              resolve(
                new Response(
                  JSON.stringify({
                    results: [{ id: 1, type: 'v', name: 'Theirs', count: 3, created_at: '' }],
                  }),
                ),
              );
          }),
      ),
    );
    const { result } = renderHook(() => useCollections(false));
    const asked = refreshCollections();
    act(() => forgetCollections());
    await act(async () => {
      answer();
      await asked;
    });
    expect(result.current.lists).toBeNull();
  });
});

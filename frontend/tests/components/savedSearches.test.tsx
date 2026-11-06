/** @vitest-environment jsdom */
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SavedSearches } from '@/components/list/SavedSearches';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('SavedSearches', () => {
  // The menu opened before the session answered used to wait for good on a
  // read it never made.
  it('reads the named searches once a late session says who is signed in', async () => {
    let signIn: () => void = () => {};
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request) => {
        const path = new URL(String(input), 'http://x').pathname;
        if (path === '/userserve/session') {
          await new Promise<void>(resolve => (signIn = resolve));
          return new Response(
            JSON.stringify({
              user: { id: 1, username: 'reader', email: null, is_admin: false, created_at: '' },
            }),
          );
        }
        return new Response(
          JSON.stringify({ results: [{ id: 1, type: 'v', name: 'Mysteries', query: 'tag=g7' }] }),
        );
      }),
    );
    render(<SavedSearches type="v" params={{}} />);
    await userEvent.click(screen.getByRole('button', { name: 'Saved searches' }));
    await act(async () => signIn());
    expect(await screen.findByRole('link', { name: 'Mysteries' })).toBeVisible();
  });
});

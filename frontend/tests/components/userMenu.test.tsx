/** @vitest-environment jsdom */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { UserMenu } from '@/components/user/UserMenu';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('UserMenu', () => {
  it('says why signing out did not happen, and stays signed in', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request) => {
        const path = new URL(String(input), 'http://x').pathname;
        if (path === '/userserve/session') {
          return new Response(
            JSON.stringify({
              user: { id: 1, username: 'reader', email: null, is_admin: false, created_at: '' },
            }),
          );
        }
        return new Response(JSON.stringify({ error: 'The account service is not answering.' }), {
          status: 503,
        });
      }),
    );
    render(<UserMenu name="reader" />);
    await userEvent.click(await screen.findByRole('button', { name: /reader/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The account service is not answering.',
    );
    // Still open on the menu, and still the signed-in button.
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeVisible();
  });
});

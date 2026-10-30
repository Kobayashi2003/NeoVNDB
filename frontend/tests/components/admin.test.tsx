/** @vitest-environment jsdom */
import { render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AdminPanel } from '@/components/admin/AdminPanel';
import { Accounts } from '@/components/admin/Accounts';
import type { Account } from '@/lib/admin';

afterEach(() => {
  vi.unstubAllGlobals();
});

const paths = (fetch: ReturnType<typeof vi.fn>) =>
  fetch.mock.calls.map(([input]) => new URL(String(input), 'http://x').pathname);

describe('AdminPanel', () => {
  it('draws the whole page while the session is asked for, and asks nothing else', () => {
    // A session that has not answered yet.
    const fetch = vi.fn(() => new Promise<Response>(() => {}));
    vi.stubGlobal('fetch', fetch);
    render(
      <main data-scroll-top>
        <AdminPanel />
      </main>,
    );

    expect(screen.getByRole('heading', { level: 1, name: 'Administration' })).toBeInTheDocument();
    expect(screen.getAllByRole('heading', { level: 2 }).map(h => h.textContent)).toEqual([
      'Mirror',
      'Accounts',
      'Translations',
    ]);
    // The cards and the table heads need no data, so they are there already.
    for (const card of ['Generations', 'Update', 'Images', 'User database backups']) {
      expect(screen.getByRole('heading', { level: 3, name: card })).toBeInTheDocument();
    }
    expect(screen.getByRole('columnheader', { name: 'Signed in' })).toBeInTheDocument();
    const nav = within(screen.getByRole('navigation', { name: 'Sections' }));
    expect(nav.getAllByRole('link').map(a => a.textContent)).toEqual([
      'Mirror',
      'Accounts',
      'Translations',
    ]);
    // The services' admin routes would refuse most readers: not asked yet.
    expect(paths(fetch).every(p => !p.includes('/admin'))).toBe(true);
  });
});

describe('Accounts', () => {
  const me: Account = {
    id: 1,
    username: 'keeper',
    email: null,
    is_admin: true,
    created_at: '2026-01-02T00:00:00Z',
    lists: 2,
    items: 30,
    ratings: 4,
    sessions: 1,
    last_seen: '2026-10-30T10:00:00Z',
  };

  it('holds rows under its heads, then fills them', async () => {
    let answer: (r: Response) => void = () => {};
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise<Response>(resolve => (answer = resolve))),
    );
    render(<Accounts self={1} />);
    expect(screen.getByRole('columnheader', { name: 'Account' })).toBeInTheDocument();
    // Placeholder rows are hidden from a screen reader: only the heads count.
    expect(screen.getAllByRole('row')).toHaveLength(1);

    answer(new Response(JSON.stringify({ results: [me] }), { status: 200 }));
    const row = await screen.findByRole('row', { name: /keeper/ });
    expect(within(row).getByText('you')).toBeInTheDocument();
    expect(screen.getAllByRole('columnheader')).toHaveLength(7);
  });
});

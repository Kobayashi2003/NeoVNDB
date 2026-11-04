/** @vitest-environment jsdom */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AdminPanel } from '@/components/admin/AdminPanel';
import { Accounts } from '@/components/admin/Accounts';
import { SERVE_FIELDS, SettingsCard } from '@/components/admin/Settings';
import type { Account, ServeSettings } from '@/lib/admin';

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
    for (const card of [
      'Generations',
      'Update',
      'Images',
      'User database backups',
      'Update settings',
      'Image settings',
    ]) {
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

describe('SettingsCard', () => {
  const env: ServeSettings = {
    update_every: '24h0m0s',
    update_retry_after: '1h0m0s',
    dump_keep: 2,
    guard_max_loss: 0.02,
    all_ages: false,
  };
  const answer = (values: ServeSettings, changed: (keyof ServeSettings)[]) =>
    Promise.resolve({ values, env, changed });

  it('sends the all-ages switch as a boolean', async () => {
    const change = vi.fn((patch: Partial<ServeSettings>) =>
      answer({ ...env, ...patch }, ['all_ages']),
    );
    render(
      <SettingsCard
        title="Update settings"
        fields={SERVE_FIELDS}
        read={() => answer(env, [])}
        change={change}
        onSaved={() => {}}
      />,
    );
    fireEvent.click(await screen.findByRole('button', { name: 'All ages: Only for guests' }));
    fireEvent.click(screen.getByRole('button', { name: 'For everyone' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(change).toHaveBeenCalledWith({ all_ages: true }));
  });

  it('saves only what was edited, as the service takes it', async () => {
    const change = vi.fn((patch: Partial<ServeSettings>) =>
      answer({ ...env, ...patch }, Object.keys(patch) as (keyof ServeSettings)[]),
    );
    const onSaved = vi.fn();
    render(
      <SettingsCard
        title="Update settings"
        fields={SERVE_FIELDS}
        read={() => answer(env, [])}
        change={change}
        onSaved={onSaved}
      />,
    );

    // Go's durations as a person types them.
    expect(await screen.findByLabelText('Check for a new dump every')).toHaveValue('24h');
    expect(screen.getByLabelText('Largest table shrink allowed (%)')).toHaveValue('2');
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();

    fireEvent.change(screen.getByLabelText('Largest table shrink allowed (%)'), {
      target: { value: '5' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(change).toHaveBeenCalledWith({ guard_max_loss: 0.05 });
    expect(screen.getByText(/Set here; \.env says 2\./)).toBeInTheDocument();
  });

  it("puts .env's value back with one button", async () => {
    const change = vi.fn(() => answer(env, []));
    render(
      <SettingsCard
        title="Update settings"
        fields={SERVE_FIELDS}
        read={() => answer({ ...env, dump_keep: 5 }, ['dump_keep'])}
        change={change}
        onSaved={() => {}}
      />,
    );
    fireEvent.click(await screen.findByRole('button', { name: "Use .env's" }));
    await waitFor(() => expect(change).toHaveBeenCalledWith({ dump_keep: 2 }));
    expect(await screen.findByLabelText('Archives kept')).toHaveValue('2');
  });

  it('refuses a count that is not a number before asking', async () => {
    const change = vi.fn();
    render(
      <SettingsCard
        title="Update settings"
        fields={SERVE_FIELDS}
        read={() => answer(env, [])}
        change={change}
        onSaved={() => {}}
      />,
    );
    fireEvent.change(await screen.findByLabelText('Archives kept'), { target: { value: 'two' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Archives kept: not a number.');
    expect(change).not.toHaveBeenCalled();
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

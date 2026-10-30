/** Every account, and what an administrator may do to one that is not their
 *  own. Their own is refused by the service too: this page is the way in. */ 'use client';

import { useEffect, useState } from 'react';
import {
  accounts,
  deleteAccountAsAdmin,
  setAdmin,
  signOutAccount,
  type Account,
} from '@/lib/admin';
import { errorText } from '@/lib/user';
import { Placeholder, surface } from '@/components/ui/Surface';
import { Button, Trouble, when } from './parts';

const COLUMNS = ['Account', 'Joined', 'Lists', 'Items', 'Ratings', 'Signed in'];

/** The table and its heads, the rows held until the accounts are read. */
function Table({ children }: { children: React.ReactNode }) {
  return (
    // Scrolled on its own past a screenful, the heads pinned: on one page
    // with the rest, a few hundred accounts would push the translations away.
    <div className={surface('max-h-[32rem] overflow-x-auto overflow-y-auto')}>
      <table className="w-full min-w-[44rem] text-left text-xs">
        <thead className="sticky top-0 z-10 bg-surface-solid text-muted shadow-[0_1px_0_rgb(255_255_255/0.1)]">
          <tr>
            {COLUMNS.map(c => (
              <th key={c} className="px-3 py-2 font-medium">
                {c}
              </th>
            ))}
            <th className="px-3 py-2" />
          </tr>
        </thead>
        <tbody className="tabular-nums">{children}</tbody>
      </table>
    </div>
  );
}

export function AccountsWaiting() {
  return (
    <Table>
      {[0, 1, 2].map(r => (
        <tr key={r} className="border-t border-white/5" aria-hidden>
          <td className="px-3 py-2">
            <Placeholder className="h-3 w-24 rounded" />
            <Placeholder className="mt-1.5 h-3 w-32 rounded" />
          </td>
          {[16, 6, 8, 6, 32].map((w, i) => (
            <td key={i} className="px-3 py-2">
              <Placeholder className="h-3 rounded" style={{ width: `${w * 0.25}rem` }} />
            </td>
          ))}
          <td className="px-3 py-2">
            <Placeholder className="ml-auto h-7 w-48 rounded-full" />
          </td>
        </tr>
      ))}
    </Table>
  );
}

export function Accounts({ self }: { self: number }) {
  const [list, setList] = useState<Account[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reads, setReads] = useState(0);
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState<number | null>(null);

  useEffect(() => {
    let live = true;
    accounts().then(
      got => {
        if (live) setList(got);
      },
      err => {
        if (live) setError(errorText(err));
      },
    );
    return () => {
      live = false;
    };
  }, [reads]);

  async function act(change: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await change();
    } catch (err) {
      setError(errorText(err));
    }
    setDeleting(null);
    setBusy(false);
    setReads(n => n + 1);
  }

  if (!list) return error ? <Trouble text={error} /> : <AccountsWaiting />;

  return (
    <div className="flex flex-col gap-3">
      <Trouble text={error} />
      <Table>
        {list.map(a => (
          <tr key={a.id} className="border-t border-white/5 align-middle">
            <td className="px-3 py-2">
              <span className="font-medium">{a.username}</span>
              {a.is_admin && <span className="ml-2 text-accent">admin</span>}
              {a.email && <span className="block text-muted">{a.email}</span>}
            </td>
            <td className="px-3 py-2">{a.created_at.slice(0, 10)}</td>
            <td className="px-3 py-2">{a.lists}</td>
            <td className="px-3 py-2">{a.items.toLocaleString()}</td>
            <td className="px-3 py-2">{a.ratings}</td>
            <td className="px-3 py-2">
              {a.sessions > 0
                ? `${a.sessions} session${a.sessions === 1 ? '' : 's'}, last ${when(a.last_seen)}`
                : '—'}
            </td>
            <td className="px-3 py-2 text-right">
              {a.id === self ? (
                <span className="text-muted">you</span>
              ) : deleting === a.id ? (
                <span className="flex items-center justify-end gap-2">
                  Delete {a.username} and all their lists?
                  <Button
                    danger
                    disabled={busy}
                    onClick={() => act(() => deleteAccountAsAdmin(a.id))}
                  >
                    Delete
                  </Button>
                  <Button disabled={busy} onClick={() => setDeleting(null)}>
                    Keep
                  </Button>
                </span>
              ) : (
                <span className="flex justify-end gap-2">
                  <Button disabled={busy} onClick={() => act(() => setAdmin(a.id, !a.is_admin))}>
                    {a.is_admin ? 'Revoke admin' : 'Make admin'}
                  </Button>
                  <Button
                    disabled={busy || a.sessions === 0}
                    onClick={() => act(() => signOutAccount(a.id))}
                  >
                    Sign out
                  </Button>
                  <Button danger disabled={busy} onClick={() => setDeleting(a.id)}>
                    Delete…
                  </Button>
                </span>
              )}
            </td>
          </tr>
        ))}
      </Table>
    </div>
  );
}

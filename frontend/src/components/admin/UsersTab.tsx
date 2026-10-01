/** Every account, and what an administrator may do to one that is not their
 *  own. Their own is refused by the service too: this page is the way in. */
"use client"

import { useEffect, useState } from "react"
import { accounts, deleteAccountAsAdmin, setAdmin, signOutAccount, type Account } from "@/lib/admin"
import { errorText } from "@/lib/user"
import { Button, Trouble, when } from "./parts"

export function UsersTab({ self }: { self: number }) {
  const [list, setList] = useState<Account[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [reads, setReads] = useState(0)
  const [busy, setBusy] = useState(false)
  const [deleting, setDeleting] = useState<number | null>(null)

  useEffect(() => {
    let live = true
    accounts().then(
      (got) => {
        if (live) setList(got)
      },
      (err) => {
        if (live) setError(errorText(err))
      },
    )
    return () => {
      live = false
    }
  }, [reads])

  async function act(change: () => Promise<unknown>) {
    setBusy(true)
    setError(null)
    try {
      await change()
    } catch (err) {
      setError(errorText(err))
    }
    setDeleting(null)
    setBusy(false)
    setReads((n) => n + 1)
  }

  if (!list) {
    return error ? <Trouble text={error} /> : <div className="h-40 animate-pulse rounded-lg bg-white/5" aria-hidden />
  }

  return (
    <div className="flex flex-col gap-3">
      <Trouble text={error} />
      <div className="overflow-x-auto rounded-lg border border-white/5 bg-surface">
        <table className="w-full min-w-[44rem] text-left text-xs">
          <thead className="text-muted">
            <tr>
              <th className="px-3 py-2 font-medium">Account</th>
              <th className="px-3 py-2 font-medium">Joined</th>
              <th className="px-3 py-2 font-medium">Lists</th>
              <th className="px-3 py-2 font-medium">Items</th>
              <th className="px-3 py-2 font-medium">Ratings</th>
              <th className="px-3 py-2 font-medium">Signed in</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {list.map((a) => (
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
                  {a.sessions > 0 ? `${a.sessions} session${a.sessions === 1 ? "" : "s"}, last ${when(a.last_seen)}` : "—"}
                </td>
                <td className="px-3 py-2 text-right">
                  {a.id === self ? (
                    <span className="text-muted">you</span>
                  ) : deleting === a.id ? (
                    <span className="flex items-center justify-end gap-2">
                      Delete {a.username} and all their lists?
                      <Button danger disabled={busy} onClick={() => act(() => deleteAccountAsAdmin(a.id))}>
                        Delete
                      </Button>
                      <Button disabled={busy} onClick={() => setDeleting(null)}>
                        Keep
                      </Button>
                    </span>
                  ) : (
                    <span className="flex justify-end gap-2">
                      <Button disabled={busy} onClick={() => act(() => setAdmin(a.id, !a.is_admin))}>
                        {a.is_admin ? "Revoke admin" : "Make admin"}
                      </Button>
                      <Button disabled={busy || a.sessions === 0} onClick={() => act(() => signOutAccount(a.id))}>
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
          </tbody>
        </table>
      </div>
    </div>
  )
}

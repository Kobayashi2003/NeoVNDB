/** The account page, rendered on the client (the server doesn't know the
 *  reader), so it starts in an "unknown" state rather than signed out. */
"use client"

import { useState } from "react"
import Link from "next/link"
import { RULES, UserError } from "@/lib/user"
import { useSession } from "@/hooks/useSession"

export function AccountPanel() {
  const session = useSession()

  if (session.status === "unknown") {
    return <div className="h-40 w-full max-w-sm animate-pulse rounded-lg bg-white/5" aria-hidden />
  }
  if (session.status === "out" || !session.user) {
    return (
      <div className="w-full max-w-sm rounded-lg border border-white/5 bg-surface p-6 text-sm">
        <p className="text-muted">This page is about your account, so it needs one.</p>
        <Link
          href="/login?next=%2Faccount"
          className="mt-3 inline-block text-accent transition-colors hover:underline"
        >
          Sign in
        </Link>
      </div>
    )
  }

  const { user } = session

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <div className="rounded-lg border border-white/5 bg-surface p-6">
        <h1 className="text-lg font-bold">{user.username}</h1>
        <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs">
          <dt className="text-muted">Email</dt>
          {/* An address has no spaces to wrap at, and this column is 288px
              wide on a phone. */}
          <dd className="break-words">{user.email ?? <span className="text-muted">None</span>}</dd>
          <dt className="text-muted">Joined</dt>
          {/* The date off the front of the timestamp, not a formatted one:
              the service sends its own zone, and rendering it in the reader's
              would have the server and the browser print different days. */}
          <dd className="tabular-nums">{user.created_at.slice(0, 10)}</dd>
          {user.is_admin && (
            <>
              <dt className="text-muted">Role</dt>
              <dd>Administrator</dd>
            </>
          )}
        </dl>
      </div>

      <PasswordForm />
    </div>
  )
}

function PasswordForm() {
  const session = useSession()
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = e.currentTarget
    const data = new FormData(form)

    setBusy(true)
    setError(null)
    setDone(false)
    try {
      await session.setPassword(String(data.get("current") ?? ""), String(data.get("next") ?? ""))
      form.reset()
      setDone(true)
    } catch (err) {
      setError(err instanceof UserError ? err.message : "Something went wrong.")
    }
    setBusy(false)
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4 rounded-lg border border-white/5 bg-surface p-6">
      <div>
        <h2 className="text-sm font-semibold">Change password</h2>
        {/* Said here because it is surprising the first time and deliberate:
            whoever knew the old password stops being signed in. */}
        <p className="mt-1 text-xs text-muted">
          This signs out every other browser. You stay signed in on this one.
        </p>
      </div>

      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium text-muted">Current password</span>
        <input
          name="current"
          type="password"
          autoComplete="current-password"
          required
          className="rounded-lg border border-white/10 bg-background/40 px-3 py-2 text-sm outline-none transition-colors focus:border-white/30"
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium text-muted">New password</span>
        <input
          name="next"
          type="password"
          autoComplete="new-password"
          required
          className="rounded-lg border border-white/10 bg-background/40 px-3 py-2 text-sm outline-none transition-colors focus:border-white/30"
        />
        <span className="text-[0.6875rem] text-muted">{RULES.password}</span>
      </label>

      {error && (
        <p role="alert" className="text-xs text-red-400">
          {error}
        </p>
      )}
      {done && <p className="text-xs text-accent">Changed.</p>}

      <button
        type="submit"
        disabled={busy}
        className="rounded-full bg-white/10 px-4 py-2 text-sm font-semibold transition-colors hover:bg-white/20 disabled:opacity-60"
      >
        {busy ? "…" : "Change password"}
      </button>
    </form>
  )
}

/** The account page, rendered on the client (the server doesn't know the
 *  reader), so it starts in an "unknown" state rather than signed out. */
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { errorText, RULES } from '@/lib/user';
import { useSession } from '@/hooks/useSession';

export function AccountPanel() {
  const session = useSession();

  if (session.status === 'unknown') {
    // Keyed apart from the panel, so the panel is a new element rather than
    // this one moved and grown (a layout shift).
    return (
      <div
        key="waiting"
        className="h-40 w-full max-w-sm animate-pulse rounded-lg bg-white/5"
        aria-hidden
      />
    );
  }
  if (session.status === 'out' || !session.user) {
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
    );
  }

  const { user } = session;

  return (
    <div key="account" className="flex w-full max-w-sm flex-col gap-4">
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
      <DeleteForm />
    </div>
  );
}

function PasswordForm() {
  const session = useSession();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);

    setBusy(true);
    setError(null);
    setDone(false);
    try {
      await session.setPassword(String(data.get('current') ?? ''), String(data.get('next') ?? ''));
      form.reset();
      setDone(true);
    } catch (err) {
      setError(errorText(err));
    }
    setBusy(false);
  }

  return (
    <form
      onSubmit={submit}
      className="flex flex-col gap-4 rounded-lg border border-white/5 bg-surface p-6"
    >
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
          className={FIELD}
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium text-muted">New password</span>
        <input name="next" type="password" autoComplete="new-password" required className={FIELD} />
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
        {busy ? '…' : 'Change password'}
      </button>
    </form>
  );
}

const FIELD =
  'rounded-lg border border-white/10 bg-background/40 px-3 py-2 text-sm outline-none transition-colors focus:border-white/30';

/** Folded until asked for, and asks for the password again: there is no
 *  undo, and a session alone may be a borrowed browser. */
function DeleteForm() {
  const session = useSession();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="self-start px-1 text-xs text-muted transition-colors hover:text-red-400"
      >
        Delete account…
      </button>
    );
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await session.deleteAccount(String(new FormData(e.currentTarget).get('password') ?? ''));
      router.push('/');
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      className="flex flex-col gap-4 rounded-lg border border-red-500/25 bg-red-500/[0.04] p-6"
    >
      <div>
        <h2 className="text-sm font-semibold text-red-300">Delete account</h2>
        <p className="mt-1 text-xs text-muted">
          Your lists, everything on them and your ratings go with it, and every browser is signed
          out. This cannot be undone.
        </p>
      </div>

      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium text-muted">Password</span>
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          required
          autoFocus
          className={FIELD}
        />
      </label>

      {error && (
        <p role="alert" className="text-xs text-red-400">
          {error}
        </p>
      )}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={busy}
          className="flex-1 rounded-full bg-red-500/80 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-500 disabled:opacity-60"
        >
          {busy ? '…' : 'Delete my account'}
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setError(null);
          }}
          className="rounded-full bg-white/10 px-4 py-2 text-sm font-semibold transition-colors hover:bg-white/20"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

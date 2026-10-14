/** Sign-in and sign-up in one form. The service's error messages are shown
 *  as written (it deliberately doesn't say which of name or password was
 *  wrong). */
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { errorText, RULES } from '@/lib/user';
import { useSession } from '@/hooks/useSession';

/** These two, which are no place to arrive already signed in. */
const AUTH = new Set(['/login', '/register']);

/** Where to go afterwards: only a path on this site (an off-site `next`
 *  would be an open redirect), and never back to this page. */
function safe(next: string | undefined): string | null {
  if (!next || !next.startsWith('/') || next.startsWith('//')) return null;
  return AUTH.has(next.split('?')[0]) ? null : next;
}

export function AuthForm({ mode, next }: { mode: 'login' | 'register'; next?: string }) {
  const session = useSession();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const registering = mode === 'register';
  const carry = safe(next);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const username = String(form.get('username') ?? '');
    const password = String(form.get('password') ?? '');

    setBusy(true);
    setError(null);
    try {
      if (registering) {
        await session.signUp(username, password, String(form.get('email') ?? ''));
      } else {
        await session.signIn(username, password);
      }
      // Nothing is rendered from the session on the server, so there is no
      // stale markup to throw away -- only somewhere to be.
      router.push(carry ?? '/');
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      className="flex w-full max-w-sm flex-col gap-4 rounded-lg border border-white/5 bg-surface p-6"
    >
      <div>
        <h1 className="text-lg font-bold">{registering ? 'Create an account' : 'Sign in'}</h1>
        <p className="mt-1 text-xs text-muted">
          {registering
            ? 'An account holds the lists you keep. Nothing else about you is stored.'
            : 'To reach the lists you keep.'}
        </p>
      </div>

      <Field
        name="username"
        label="Username"
        autoComplete="username"
        hint={registering ? RULES.username : undefined}
        required
      />
      <Field
        name="password"
        label="Password"
        type="password"
        autoComplete={registering ? 'new-password' : 'current-password'}
        hint={registering ? RULES.password : undefined}
        required
      />
      {registering && (
        <Field
          name="email"
          label="Email"
          type="email"
          autoComplete="email"
          hint="Optional, and unused today -- there is nothing here that sends mail."
        />
      )}

      {error && (
        <p role="alert" className="text-xs text-red-400">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={busy}
        className="rounded-full bg-accent px-4 py-2 text-sm font-semibold text-background transition-colors hover:bg-accent-hover disabled:opacity-60"
      >
        {busy ? '…' : registering ? 'Create account' : 'Sign in'}
      </button>

      <p className="text-xs text-muted">
        {registering ? 'Already have an account? ' : 'No account yet? '}
        <Link
          href={`${registering ? '/login' : '/register'}${carry ? `?next=${encodeURIComponent(carry)}` : ''}`}
          className="text-accent transition-colors hover:underline coarse:py-1"
        >
          {registering ? 'Sign in' : 'Create one'}
        </Link>
      </p>
    </form>
  );
}

function Field({
  name,
  label,
  hint,
  ...rest
}: { name: string; label: string; hint?: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium text-muted">{label}</span>
      <input
        name={name}
        className="rounded-lg border border-white/10 bg-background/40 px-3 py-2 text-sm outline-none transition-colors focus:border-white/30"
        {...rest}
      />
      {hint && <span className="text-[0.6875rem] text-muted">{hint}</span>}
    </label>
  );
}

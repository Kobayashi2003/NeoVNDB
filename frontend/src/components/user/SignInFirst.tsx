/** What a page about the reader shows when there is no reader yet.
 *
 *  Both links carry where it was shown from, so signing in (or up) comes back
 *  here rather than dropping the reader on the front page having forgotten
 *  what they were after. */
import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';

export function SignInFirst({
  next,
  icon: Icon,
  title,
  children,
}: {
  next: string;
  icon: LucideIcon;
  title: string;
  children: React.ReactNode;
}) {
  const carry = `?next=${encodeURIComponent(next)}`;
  return (
    <div className="mx-auto flex w-full max-w-sm flex-col items-center rounded-xl border border-white/5 bg-surface px-6 py-10 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-accent/10 text-accent ring-1 ring-accent/20">
        <Icon className="size-5" aria-hidden />
      </span>
      <h2 className="mt-4 text-base font-semibold">{title}</h2>
      <p className="mt-1.5 text-sm text-muted">{children}</p>
      <div className="mt-6 flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
        <Link
          href={`/login${carry}`}
          className="rounded-full bg-accent px-5 py-2 text-sm font-semibold text-background transition-colors hover:bg-accent-hover"
        >
          Sign in
        </Link>
        <Link
          href={`/register${carry}`}
          className="rounded-full bg-white/10 px-5 py-2 text-sm font-semibold transition-colors hover:bg-white/20"
        >
          Create an account
        </Link>
      </div>
    </div>
  );
}

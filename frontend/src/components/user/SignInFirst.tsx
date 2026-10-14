/** What a page about the reader shows when there is no reader yet.
 *
 *  The link carries where it was shown from, so signing in comes back here
 *  rather than dropping the reader on the front page having forgotten what
 *  they were after. */
import Link from 'next/link';

export function SignInFirst({ next, children }: { next: string; children: React.ReactNode }) {
  return (
    <div className="w-full max-w-sm rounded-lg border border-white/5 bg-surface p-6 text-sm">
      <p className="text-muted">{children}</p>
      <Link
        href={`/login?next=${encodeURIComponent(next)}`}
        className="mt-3 inline-block text-accent transition-colors hover:underline"
      >
        Sign in
      </Link>
    </div>
  );
}

/** What a page about the reader shows when there is no reader yet.
 *
 *  Both links carry where it was shown from, so signing in (or up) comes back
 *  here rather than dropping the reader on the front page having forgotten
 *  what they were after. */
import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import { Notice, noticeAction } from '@/components/ui/Notice';

export function SignInFirst({
  next,
  icon,
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
    <Notice
      icon={icon}
      title={title}
      actions={
        <>
          <Link href={`/login${carry}`} className={noticeAction(true)}>
            Sign in
          </Link>
          <Link href={`/register${carry}`} className={noticeAction()}>
            Create an account
          </Link>
        </>
      }
    >
      {children}
    </Notice>
  );
}

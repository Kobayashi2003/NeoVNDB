/** The shape of a page that has nothing to show but a reason.
 *
 *  Not found and gone wrong are the same page with different words, so they
 *  are the same component: a heading, a sentence a reader can act on, and a
 *  way out that is never the back button. */
import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import { Notice, noticeAction } from './Notice';

export function Trouble({
  icon,
  title,
  tone,
  children,
  action,
}: {
  icon: LucideIcon;
  title: string;
  tone?: 'plain' | 'trouble';
  children: React.ReactNode;
  /** Offered before the links home, where there is something to try. */
  action?: React.ReactNode;
}) {
  return (
    <main className="mx-auto flex w-full max-w-page flex-col px-4">
      <Notice
        icon={icon}
        title={title}
        tone={tone}
        page
        className="min-h-[70dvh]"
        actions={
          <>
            {action}
            <Link href="/" className={noticeAction(!action)}>
              Front page
            </Link>
            <Link href="/v" className={noticeAction()}>
              Browse visual novels
            </Link>
          </>
        }
      >
        {children}
      </Notice>
    </main>
  );
}

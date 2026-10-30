/** The admin page: the services, the accounts and the translations on one
 *  page, a row of pills to jump between them. Rendered on the client like the
 *  account page: the server does not know who is asking, and the services'
 *  admin routes answer only an administrator's cookie, which the edge checks. */
'use client';

import { ShieldCheck } from 'lucide-react';
import { useSession } from '@/hooks/useSession';
import { SignInFirst } from '@/components/user/SignInFirst';
import { Group, GROUP } from '@/components/ui/Group';
import { Notice } from '@/components/ui/Notice';
import { SectionNav } from '@/components/ui/SectionNav';
import { Accounts, AccountsWaiting } from './Accounts';
import { Mirror, MirrorWaiting } from './Mirror';
import { Translations, TranslationsWaiting } from './Translations';

export function AdminPanel() {
  const session = useSession();

  const { user } = session;
  if (session.status !== 'unknown') {
    if (!user) {
      return (
        <SignInFirst next="/admin" icon={ShieldCheck} title="Administrators only">
          This page is for administrators, so it needs you signed in.
        </SignInFirst>
      );
    }
    if (!user.is_admin) {
      return (
        <Notice icon={ShieldCheck} title="Administrators only">
          An account is made one from backend/users with{' '}
          <code className="rounded bg-white/[0.06] px-1">users admin &lt;name&gt;</code>.
        </Notice>
      );
    }
  }

  // Until the session answers, the page as it will be with nothing read yet:
  // asking the services before then would only be refused for most readers.
  return (
    <div className="flex w-full flex-col">
      <h1 className="mb-5 text-xl font-bold sm:text-2xl">Administration</h1>
      <SectionNav of={GROUP} />
      {/* Translations last: it is the long one, a page of entries at a time. */}
      <div className="flex flex-col gap-14">
        <Group title="Mirror">{user ? <Mirror /> : <MirrorWaiting />}</Group>
        <Group title="Accounts">{user ? <Accounts self={user.id} /> : <AccountsWaiting />}</Group>
        <Group title="Translations">{user ? <Translations /> : <TranslationsWaiting />}</Group>
      </div>
    </div>
  );
}

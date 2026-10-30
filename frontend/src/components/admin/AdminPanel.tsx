/** The admin page. Rendered on the client like the account page: the server
 *  does not know who is asking, and the services' admin routes answer only an
 *  administrator's cookie, which the edge checks. */
'use client';

import { useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { useSession } from '@/hooks/useSession';
import { SignInFirst } from '@/components/user/SignInFirst';
import { TabBar } from '@/components/ui/TabBar';
import { Notice } from '@/components/ui/Notice';
import { Placeholder } from '@/components/ui/Surface';
import { MirrorTab } from './MirrorTab';
import { TranslationsTab } from './TranslationsTab';
import { UsersTab } from './UsersTab';

const TABS = [
  { value: 'mirror', label: 'Mirror' },
  { value: 'translations', label: 'Translations' },
  { value: 'users', label: 'Users' },
];

export function AdminPanel() {
  const session = useSession();
  const [tab, setTab] = useState('mirror');

  if (session.status === 'unknown') {
    return <Placeholder className="h-64 w-full" />;
  }
  if (session.status === 'out' || !session.user) {
    return (
      <SignInFirst next="/admin" icon={ShieldCheck} title="Administrators only">
        This page is for administrators, so it needs you signed in.
      </SignInFirst>
    );
  }
  if (!session.user.is_admin) {
    return (
      <Notice icon={ShieldCheck} title="Administrators only">
        An account is made one from backend/users with{' '}
        <code className="rounded bg-white/[0.06] px-1">users admin &lt;name&gt;</code>.
      </Notice>
    );
  }

  return (
    <div className="flex w-full flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold sm:text-2xl">Administration</h1>
        <TabBar tabs={TABS} active={tab} onChange={setTab} />
      </div>
      {tab === 'mirror' && <MirrorTab />}
      {tab === 'translations' && <TranslationsTab />}
      {tab === 'users' && <UsersTab self={session.user.id} />}
    </div>
  );
}

import type { Metadata } from 'next';
import { AccountPanel } from '@/components/user/AccountPanel';

export const metadata: Metadata = { title: 'Account - NeoVNDB' };

export default function AccountPage() {
  return (
    <main className="flex flex-1 items-start justify-center px-4 py-10">
      <AccountPanel />
    </main>
  );
}

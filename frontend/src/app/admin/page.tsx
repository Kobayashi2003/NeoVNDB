import type { Metadata } from 'next';
import { AdminPanel } from '@/components/admin/AdminPanel';

export const metadata: Metadata = { title: 'Admin - NeoVNDB' };

export default function AdminPage() {
  return (
    <main data-scroll-top className="mx-auto flex w-full max-w-page flex-1 px-4 py-6 pb-12">
      <AdminPanel />
    </main>
  );
}

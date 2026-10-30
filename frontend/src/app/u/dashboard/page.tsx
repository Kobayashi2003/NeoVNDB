import type { Metadata } from 'next';
import { Dashboard } from '@/components/dashboard/Dashboard';

export const metadata: Metadata = { title: 'Dashboard - NeoVNDB' };

export default function DashboardPage() {
  return (
    <main className="mx-auto flex w-full max-w-page flex-col gap-4 px-4 py-6 pb-12">
      <h1 className="text-xl font-bold sm:text-2xl">Dashboard</h1>
      <Dashboard />
    </main>
  );
}

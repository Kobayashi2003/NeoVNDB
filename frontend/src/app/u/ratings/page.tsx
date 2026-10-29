import type { Metadata } from 'next';
import Link from 'next/link';
import { one } from '@/lib/href';
import { still } from '@/lib/viewTransitions';
import { Dashboard } from '@/components/dashboard/Dashboard';
import { pill } from '@/components/ui/Pill';
import { RatingsPanel } from '@/components/user/RatingsPanel';

export const metadata: Metadata = { title: 'Dashboard - NeoVNDB' };

const TABS = [
  { view: null, label: 'Overview' },
  { view: 'ratings', label: 'Ratings' },
] as const;

/** The reader's own page, apart from the lists: an overview of what they
 *  hold and rated, and every rating to change, which belongs to an item
 *  rather than to a list. */
export default async function DashboardPage({ searchParams }: PageProps<'/u/ratings'>) {
  const query = await searchParams;
  const view = one(query, 'view') === 'ratings' ? 'ratings' : null;
  const page = Math.max(1, Number(one(query, 'page')) || 1);
  return (
    <main className="mx-auto flex w-full max-w-page flex-col gap-4 px-4 py-6 pb-12">
      <div style={still('tabs/u/ratings')} className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-bold sm:text-2xl">Dashboard</h1>
        <nav aria-label="Dashboard" className="flex gap-1">
          {TABS.map(t => (
            <Link
              key={t.label}
              href={t.view ? `/u/ratings?view=${t.view}` : '/u/ratings'}
              aria-current={view === t.view ? 'page' : undefined}
              className={pill({ tone: view === t.view ? 'on' : 'quiet', size: 'sm' })}
            >
              {t.label}
            </Link>
          ))}
        </nav>
      </div>
      {view === 'ratings' ? <RatingsPanel page={page} params={query} /> : <Dashboard />}
    </main>
  );
}

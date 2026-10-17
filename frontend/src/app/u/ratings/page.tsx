import type { Metadata } from 'next';
import { RatingsPanel } from '@/components/user/RatingsPanel';

export const metadata: Metadata = { title: 'Your ratings - NeoVNDB' };

/** A page of its own, apart from the lists: a rating belongs to an item, not
 *  to a list. */
export default async function RatingsPage({ searchParams }: PageProps<'/u/ratings'>) {
  const query = await searchParams;
  const raw = query.page;
  const page = Math.max(1, Number(Array.isArray(raw) ? raw[0] : raw) || 1);
  return (
    <main className="mx-auto flex w-full max-w-page flex-col px-4 py-6 pb-12">
      <RatingsPanel page={page} params={query} />
    </main>
  );
}

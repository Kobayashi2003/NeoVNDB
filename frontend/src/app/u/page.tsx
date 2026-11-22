import type { Metadata } from 'next';
import { CollectionsPanel } from '@/components/user/CollectionsPanel';

export const metadata: Metadata = { title: 'Your lists - NeoVNDB' };

export default function CollectionsPage() {
  return (
    // Keep `<main>` at `max-w-page` so view transitions to/from full-width
    // pages never rescale the page snapshot; the inner box holds the 3xl cap.
    <main className="mx-auto w-full max-w-page">
      <div className="mx-auto flex w-full max-w-3xl flex-col px-4 py-6 pb-12">
        <h1 className="mb-4 text-xl font-bold sm:text-2xl">Your lists</h1>
        <CollectionsPanel />
      </div>
    </main>
  );
}

import type { Metadata } from 'next';
import { TriangleAlert } from 'lucide-react';
import { siteStats } from '@/lib/api';
import { Notice } from '@/components/ui/Notice';
import { SiteStats } from '@/components/stats/SiteStats';

export const metadata: Metadata = {
  title: 'Statistics - NeoVNDB',
  description: 'The whole of vndb counted: titles, releases, characters, staff, tags and traits.',
};

/** The whole database counted, for anyone. The read API counts each dump once
 *  as it goes live, so this is a read of numbers already made. */
export default async function StatsPage() {
  const counted = await siteStats().catch(() => null);
  return (
    <main data-scroll-top className="mx-auto flex w-full max-w-page flex-col px-4 py-6 pb-12">
      <div className="mb-5">
        <h1 className="text-xl font-bold sm:text-2xl">Statistics</h1>
        {counted && (
          <p className="mt-1 text-sm text-muted">
            Everything in this mirror of vndb, counted from the dump of{' '}
            {dumpDay(counted.generation)}.
          </p>
        )}
      </div>
      {counted ? (
        <SiteStats counted={counted} />
      ) : (
        <Notice icon={TriangleAlert} title="The statistics could not be loaded" tone="trouble">
          The read API did not answer. Try again in a minute.
        </Notice>
      )}
    </main>
  );
}

/** "20261028+t3" as the day it names. */
function dumpDay(generation: string): string {
  const m = /^(\d{4})(\d{2})(\d{2})/.exec(generation);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : generation;
}

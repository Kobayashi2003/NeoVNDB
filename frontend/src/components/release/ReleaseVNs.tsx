/** The works a release contains, in the body since a release has no subject
 *  of its own. The type badge is per work (a disc can be complete for one and
 *  a trial of another). */

import Link from 'next/link';
import { cn } from '@/lib/utils';
import { enumLabel } from '@/lib/enums';
import type { ReleasedVN } from '@/lib/types';
import { Name } from '@/components/ui/Name';
import { surface } from '@/components/ui/Surface';

/** Complete reads as the plain case; the other two are qualifications. */
const RTYPE_CLASS: Record<string, string> = {
  complete: 'bg-green-500/15 text-green-400',
  partial: 'bg-yellow-500/15 text-yellow-400',
  trial: 'bg-white/10 text-white/60',
};

export function ReleaseVNs({ vns }: { vns: ReleasedVN[] }) {
  return (
    <div className={surface()}>
      {vns.map(v => (
        <div
          key={v.id}
          className="flex items-baseline gap-3 border-b border-white/5 px-3 py-2 last:border-0"
        >
          <span
            className={cn(
              'shrink-0 rounded px-1.5 py-0.5 text-xs font-medium sm:w-20 sm:text-center',
              RTYPE_CLASS[v.rtype] ?? 'bg-white/10 text-white/60',
            )}
          >
            {enumLabel('RTYPE', v.rtype)}
          </span>
          <Link
            href={`/${v.id}`}
            className="min-w-0 text-sm transition-colors hover:text-accent coarse:py-1"
          >
            <Name name={v.title} original={v.alttitle} />
          </Link>
        </div>
      ))}
    </div>
  );
}

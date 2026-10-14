'use client';

/** Staff by role, grouped first by edition: credits on the work itself, then
 *  those for a named version (port, translation). Names are the alias
 *  credited on this work. */

import Link from 'next/link';
import { cn } from '@/lib/utils';
import { iconOf } from '@/lib/icons';
import { enumLabel } from '@/lib/enums';
import { display } from '@/lib/format';
import { Icon } from '@/components/ui/Icon';
import { usePrefs } from '@/hooks/usePrefs';
import type { Edition, StaffCredit } from '@/lib/types';

/** The work's credits, then each edition's in dump order. A credit whose
 *  edition is missing from the list is kept under its number, not dropped. */
function grouped(staff: StaffCredit[], editions: Edition[]) {
  const base = staff.filter(c => c.eid === null);
  const known = new Set(editions.map(e => e.eid));

  const rest = editions
    .map(edition => ({ edition, credits: staff.filter(c => c.eid === edition.eid) }))
    .filter(g => g.credits.length > 0);

  const strays = [...new Set(staff.map(c => c.eid))]
    .filter((eid): eid is number => eid !== null && !known.has(eid))
    .sort((a, b) => a - b)
    .map(eid => ({
      edition: { eid, name: `Edition ${eid}`, lang: null, official: true } satisfies Edition,
      credits: staff.filter(c => c.eid === eid),
    }));

  return { base, rest: [...rest, ...strays] };
}

function byRole(credits: StaffCredit[]): [string, StaffCredit[]][] {
  const roles = new Map<string, StaffCredit[]>();
  for (const credit of credits) {
    const list = roles.get(credit.role) ?? [];
    list.push(credit);
    roles.set(credit.role, list);
  }
  return [...roles.entries()];
}

export function VNStaff({ staff, editions }: { staff: StaffCredit[]; editions: Edition[] }) {
  const { base, rest } = grouped(staff, editions);

  return (
    <div className="flex flex-col gap-3">
      {base.length > 0 && <Credits credits={base} />}
      {rest.map(({ edition, credits }) => (
        <div key={edition.eid} className="flex flex-col gap-1">
          <p className="flex items-center gap-1.5 px-1 text-xs font-semibold text-muted">
            {edition.lang && iconOf('LANGUAGE', edition.lang) && (
              <Icon
                cls={iconOf('LANGUAGE', edition.lang)}
                title={enumLabel('LANGUAGE', edition.lang)}
                className="shrink-0"
              />
            )}
            <span className="min-w-0 truncate">{edition.name}</span>
            {!edition.official && (
              <span className="shrink-0 rounded bg-white/10 px-1.5 py-0.5 text-[0.625rem] font-medium">
                Unofficial
              </span>
            )}
          </p>
          <Credits credits={credits} />
        </div>
      ))}
    </div>
  );
}

function Credits({ credits, className }: { credits: StaffCredit[]; className?: string }) {
  const { original } = usePrefs();

  return (
    <dl className={cn('rounded-lg border border-white/5 bg-surface px-3 py-1', className)}>
      {byRole(credits).map(([role, list]) => (
        <div
          key={role}
          className="flex flex-col gap-0.5 border-b border-white/5 py-1.5 last:border-0 sm:flex-row sm:gap-2"
        >
          <dt className="shrink-0 pt-0.5 text-xs text-muted sm:w-28">
            {enumLabel('STAFF_ROLE', role)}
          </dt>
          <dd className="min-w-0 flex-1 text-xs text-white/90">
            {list.map((c, i) => (
              <span key={`${c.id}-${i}`}>
                {i > 0 && ', '}
                <Link href={`/${c.id}`} className="hover:text-accent coarse:py-1">
                  {display(c.name, c.original, original)}
                </Link>
                {c.note && <span className="text-muted"> ({c.note})</span>}
              </span>
            ))}
          </dd>
        </div>
      ))}
    </dl>
  );
}

import { useEffect, useState } from 'react';
import { type LinkSite, linkSites } from '@/lib/api';
import { type Condition, conditionOf } from '@/lib/conditions';

/** Link sites, fetched once per page and shared by every chip. */
let sites: LinkSite[] | null = null;
let pending: Promise<LinkSite[]> | null = null;

/** A condition as the editor uses it: a link-site condition becomes a list of
 *  the sites that appear on this type. */
export function useCondition(type: string, name: string): Condition | undefined {
  const cond = conditionOf(type, name);
  const [, loaded] = useState(0);
  const needs = cond?.kind === 'site' && sites === null;
  useEffect(() => {
    if (!needs) return;
    let live = true;
    pending ??= linkSites().then(s => (sites = s));
    pending.then(
      () => live && loaded(n => n + 1),
      () => {
        pending = null;
      },
    );
    return () => {
      live = false;
    };
  }, [needs]);
  if (cond?.kind !== 'site') return cond;
  const choices = (sites ?? [])
    .filter(s => s.entities.includes(type))
    .map(s => ({ value: s.site, label: s.label }));
  return { key: cond.key, label: cond.label, kind: 'enum', choices };
}

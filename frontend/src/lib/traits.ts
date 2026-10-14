/** Grouping and gating for a character's traits, shared by every place that
 *  shows them so the group order and the sexual gate are decided once. */

import type { Trait } from './types';

/** vndb's own group order; anything unknown falls through alphabetically. */
const GROUP_ORDER = [
  'Hair',
  'Eyes',
  'Body',
  'Clothes',
  'Items',
  'Accessories',
  'Personality',
  'Role',
  'Engages in',
  'Engages in (Sexual)',
  'Subject of',
  'Subject of (Sexual)',
];

/** Two groups describe sex acts outright. They sit behind the sexual level
 *  rather than the spoiler level -- they are not a plot revelation, and a
 *  reader who reveals spoilers has not thereby asked to see them. */
const SEXUAL_GROUPS = new Set(['Engages in (Sexual)', 'Subject of (Sexual)']);

/** The traits a reader has asked to see at all, before any spoiler level
 *  applies. Everything that counts or shows traits starts here, so the gate
 *  cannot be applied in one place and forgotten in another. */
export function allowedTraits(traits: Trait[], explicit: boolean): Trait[] {
  if (explicit) return traits;
  return traits.filter(t => !SEXUAL_GROUPS.has(t.group_name ?? ''));
}

export interface GroupedTraits {
  /** Group name to its visible traits, in vndb's group order. */
  groups: [string, Trait[]][];
  /** How many are held back by the spoiler level alone, which is what a
   *  reveal control offers to show. */
  hiddenMinor: number;
  hiddenMajor: number;
}

export function groupTraits(
  traits: Trait[],
  spoilerLevel: number,
  explicit: boolean,
): GroupedTraits {
  const allowed = allowedTraits(traits, explicit);

  const groups = new Map<string, Trait[]>();
  for (const t of allowed) {
    if (t.spoiler > spoilerLevel) continue;
    const key = t.group_name ?? 'Other';
    groups.set(key, [...(groups.get(key) ?? []), t]);
  }

  const known = GROUP_ORDER.filter(g => groups.has(g));
  const rest = [...groups.keys()].filter(g => !GROUP_ORDER.includes(g)).sort();

  return {
    groups: [...known, ...rest].map(g => [g, groups.get(g)!]),
    hiddenMinor: allowed.filter(t => t.spoiler === 1 && spoilerLevel < 1).length,
    hiddenMajor: allowed.filter(t => t.spoiler === 2 && spoilerLevel < 2).length,
  };
}

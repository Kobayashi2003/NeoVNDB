/** How each relation draws: one colour each, solid for the three that read in
 *  a direction (and carry an arrow), dashed for the rest. */

import { isSymmetric } from '@/lib/graph';

const COLOUR: Record<string, string> = {
  seq: '#1db954',
  side: '#3b82f6',
  fan: '#f59e0b',
  alt: '#a78bfa',
  set: '#9ca3af',
  char: '#ec4899',
  ser: '#14b8a6',
};

export function relationStyle(relation: string): { colour: string; dashed: boolean } {
  return { colour: COLOUR[relation] ?? '#9ca3af', dashed: isSymmetric(relation) };
}

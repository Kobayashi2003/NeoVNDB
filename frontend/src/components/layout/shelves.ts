/** The seven shelves as the header names them.
 *
 *  Shared because the bar has two forms -- a row of links when they fit, one
 *  menu when they do not -- and both have to agree about what there is and
 *  what to call it. */

export const TYPES = ['v', 'c', 'r', 'p', 's', 'g', 'i'] as const;

/** Short enough to fit seven of them in one row. `LIST[type].label` is the
 *  full name, used where there is room for it. */
export const SHORT: Record<string, string> = {
  v: 'Novels',
  c: 'Characters',
  r: 'Releases',
  p: 'Producers',
  s: 'Staff',
  g: 'Tags',
  i: 'Traits',
};

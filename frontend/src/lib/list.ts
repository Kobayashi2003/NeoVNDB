/** Each type's list page: fields, sorts and default sort, in one table.
 *  `searchrank` is omitted; it applies on its own when there is a search. */

export interface Sort {
  value: string;
  label: string;
  /** True when the interesting end is the high one, so the first click on it
   *  should read downwards: nobody wants the worst-rated visual novels. */
  descending?: boolean;
}

/** Which way a sort reads when the address does not say: its interesting end
 *  first, and the best match first for a search. */
export function readsDown(sorts: Sort[], value: string): boolean {
  return value === 'searchrank' || (sorts.find(s => s.value === value)?.descending ?? false);
}

/** The `reverse=` for this direction: left out for the sort's own way, spelled
 *  out otherwise, `false` included (left out, it would read as the default). */
export function reverseParam(sorts: Sort[], value: string, reverse: boolean): string | null {
  return reverse === readsDown(sorts, value) ? null : String(reverse);
}

export interface ListSpec {
  /** The API endpoint, which is the type's own name. */
  type: string;
  /** Plural, for the heading. */
  label: string;
  fields: string;
  sorts: Sort[];
  defaultSort: string;
}

/** The seven types the dump carries, in the order every page lists them. */
export const TYPES = ['v', 'c', 'r', 'p', 's', 'g', 'i'] as const;

const BY_NAME: Sort = { value: 'name', label: 'Name' };
const BY_TITLE: Sort = { value: 'title', label: 'Title' };

export const LIST: Record<string, ListSpec> = {
  v: {
    type: 'vn',
    label: 'Visual Novels',
    fields: [
      'title',
      'alttitle',
      'released',
      'rating',
      'votecount',
      'languages',
      'platforms',
      'devstatus',
      'image.url',
      'image.dims',
      'image.sexual',
      'image.violence',
    ].join(','),
    sorts: [
      BY_TITLE,
      { value: 'released', label: 'Release date', descending: true },
      { value: 'rating', label: 'Rating', descending: true },
      { value: 'votecount', label: 'Votes', descending: true },
      { value: 'length_minutes', label: 'Length' },
    ],
    defaultSort: 'rating',
  },
  c: {
    type: 'character',
    label: 'Characters',
    fields: [
      'name',
      'original',
      'sex',
      'image.url',
      'image.dims',
      'image.sexual',
      'image.violence',
    ].join(','),
    sorts: [BY_NAME, { value: 'age', label: 'Age' }, { value: 'height', label: 'Height' }],
    defaultSort: 'name',
  },
  r: {
    type: 'release',
    label: 'Releases',
    fields: [
      'title',
      'alttitle',
      'released',
      'minage',
      'platforms',
      'official',
      'patch',
      'freeware',
    ].join(','),
    sorts: [BY_TITLE, { value: 'released', label: 'Release date', descending: true }],
    defaultSort: 'released',
  },
  p: {
    type: 'producer',
    label: 'Producers',
    fields: ['name', 'original', 'lang', 'type'].join(','),
    sorts: [BY_NAME],
    defaultSort: 'name',
  },
  s: {
    type: 'staff',
    label: 'Staff',
    fields: ['name', 'original', 'lang', 'gender'].join(','),
    sorts: [BY_NAME],
    defaultSort: 'name',
  },
  g: {
    type: 'tag',
    label: 'Tags',
    fields: [
      'name',
      'category',
      'description',
      'vn_count',
      'translation.name',
      'translation.description',
    ].join(','),
    sorts: [BY_NAME, { value: 'vn_count', label: 'Visual novels', descending: true }],
    defaultSort: 'vn_count',
  },
  i: {
    type: 'trait',
    label: 'Traits',
    fields: [
      'name',
      'group_name',
      'description',
      'char_count',
      'sexual',
      'translation.name',
      'translation.description',
      'group_translation',
    ].join(','),
    sorts: [BY_NAME, { value: 'char_count', label: 'Characters', descending: true }],
    defaultSort: 'char_count',
  },
};

/** How many results one page shows. Small enough that a page of visual novels
 *  with covers is not a megabyte, large enough to be worth paging. */
export const PAGE_SIZE = 24;

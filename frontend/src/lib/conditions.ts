/** What the condition builder offers per type. Keys are the backend filters in
 *  api/<type>/filters.go; keep the two in step. The text view accepts any
 *  filter, so a missing entry only means it has no control here. */

import { VN_RELATION } from './enums';
import { choices, LANGUAGES, PLATFORMS, STAFF_GENDER, type Choice } from './choices';
import { group, leaf, print, type Op, type TidyRules } from './expr';

export type ConditionKind =
  /** `ordered` choices form a scale, so they can also be compared. */
  | { kind: 'enum'; choices: Choice[]; ordered?: boolean }
  | { kind: 'bool' }
  | { kind: 'number'; hint?: string; unit?: string }
  | { kind: 'date' }
  | { kind: 'text'; hint?: string }
  /** An external link site; the choices come from /meta/extlinks. */
  | { kind: 'site' }
  /** WxH, compared on both dimensions. */
  | { kind: 'resolution' }
  /** A person credited on this item, optionally in one role: s224:scenario. */
  | { kind: 'credit'; target: 's'; roles: Choice[] }
  /** Matched by id: staff=s8. */
  | { kind: 'entity'; target: string }
  /** Tag or trait with optional minimum score and spoiler ceiling. */
  | { kind: 'scored'; target: 'g' | 'i'; score: boolean }
  /** By id, or by a condition on the related type: release=(lang=en). */
  | { kind: 'relation'; target: string };

export type Condition = ConditionKind & { key: string; label: string };

export const OP_LABEL: Record<Op, string> = {
  '=': 'is',
  '!=': 'is not',
  '>=': '≥',
  '<=': '≤',
  '>': '>',
  '<': '<',
};

export function opsFor(c: ConditionKind): Op[] {
  switch (c.kind) {
    case 'number':
    case 'date':
      return ['=', '!=', '>=', '<=', '>', '<'];
    case 'resolution':
      return ['=', '!=', '>=', '<='];
    case 'enum':
      return c.ordered ? ['=', '!=', '>=', '<='] : ['=', '!='];
    case 'bool':
    case 'text':
      return ['='];
    default:
      return ['=', '!='];
  }
}

const LANG = () => ({ kind: 'enum' as const, choices: LANGUAGES });
const PLATFORM = () => ({ kind: 'enum' as const, choices: PLATFORMS });
const BOOL = { kind: 'bool' as const };
const SEARCH = { kind: 'text' as const, hint: 'words' };
const NUM = { kind: 'number' as const };
const LINK = { key: 'extlink', label: 'Has a link to', kind: 'site' as const };

/** A cover's voted level, in the steps the site blurs by; unvoted covers match none. */
const COVER_SEXUAL: Choice[] = [
  { value: 'safe', label: 'Safe' },
  { value: 'suggestive', label: 'Suggestive' },
  { value: 'explicit', label: 'Explicit' },
];
const COVER_VIOLENCE: Choice[] = [
  { value: 'tame', label: 'Tame' },
  { value: 'violent', label: 'Violent' },
  { value: 'brutal', label: 'Brutal' },
];

/** Release animation, as the dump's ani_story / ani_ero record it. */
const ANIMATION: Choice[] = [
  { value: '1', label: 'None' },
  { value: '2', label: 'Simple effects' },
  { value: '3', label: 'Some scenes animated' },
  { value: '4', label: 'All scenes animated' },
];

/** What a release's DRM may require; each is a flag on vndb's drm table. */
const DRM_NEEDS: Choice[] = [
  { value: 'online', label: 'Always online' },
  { value: 'account', label: 'An account' },
  { value: 'activate', label: 'Online activation' },
  { value: 'alimit', label: 'An activation limit' },
  { value: 'cdkey', label: 'A CD key' },
  { value: 'disc', label: 'The disc in the drive' },
  { value: 'physical', label: 'A physical item' },
  { value: 'cloud', label: 'Cloud play' },
];
const on = (target: string) => ({ kind: 'entity' as const, target });
const rel = (target: string) => ({ kind: 'relation' as const, target });

export const CONDITIONS: Record<string, Condition[]> = {
  v: [
    { key: 'search', label: 'Title', ...SEARCH },
    { key: 'lang', label: 'Language', ...LANG() },
    { key: 'olang', label: 'Original language', ...LANG() },
    { key: 'platform', label: 'Platform', ...PLATFORM() },
    { key: 'length', label: 'Length', kind: 'enum', choices: choices('LENGTH') },
    { key: 'devstatus', label: 'Status', kind: 'enum', choices: choices('DEVSTATUS') },
    { key: 'released', label: 'Released', kind: 'date' },
    { key: 'rating', label: 'Rating', kind: 'number', hint: '10–100' },
    { key: 'average', label: 'Average', kind: 'number', hint: '10–100' },
    { key: 'votecount', label: 'Votes', ...NUM },
    { key: 'length_minutes', label: 'Play time', kind: 'number', hint: 'minutes', unit: 'min' },
    {
      key: 'relation',
      label: 'Has a relation',
      kind: 'enum',
      choices: Object.entries(VN_RELATION).map(([value, label]) => ({ value, label })),
    },
    { key: 'tag', label: 'Tag', kind: 'scored', target: 'g', score: true },
    { key: 'dtag', label: 'Tag (not inherited)', kind: 'scored', target: 'g', score: true },
    { key: 'release', label: 'Release', ...rel('r') },
    { key: 'developer', label: 'Developer', ...rel('p') },
    { key: 'publisher', label: 'Publisher', ...rel('p') },
    { key: 'producer', label: 'Producer', ...rel('p') },
    { key: 'character', label: 'Character', ...rel('c') },
    { key: 'trait', label: 'Character trait', ...on('i') },
    { key: 'staff', label: 'Staff', ...rel('s') },
    { key: 'seiyuu', label: 'Voice actor', ...rel('s') },
    {
      key: 'credit',
      label: 'Staff in a role',
      kind: 'credit',
      target: 's',
      roles: choices('STAFF_ROLE'),
    },
    { key: 'cover_sexual', label: 'Cover: sexual content', kind: 'enum', choices: COVER_SEXUAL },
    { key: 'cover_violence', label: 'Cover: violence', kind: 'enum', choices: COVER_VIOLENCE },
    { key: 'medium', label: 'Medium', kind: 'enum', choices: choices('MEDIUM') },
    { key: 'has_description', label: 'Has description', ...BOOL },
    { key: 'has_screenshot', label: 'Has screenshots', ...BOOL },
    { key: 'has_anime', label: 'Has anime', ...BOOL },
    LINK,
  ],
  r: [
    { key: 'search', label: 'Title', ...SEARCH },
    { key: 'lang', label: 'Language', ...LANG() },
    { key: 'olang', label: 'Original language', ...LANG() },
    { key: 'platform', label: 'Platform', ...PLATFORM() },
    { key: 'medium', label: 'Medium', kind: 'enum', choices: choices('MEDIUM') },
    { key: 'rtype', label: 'Type', kind: 'enum', choices: choices('RTYPE') },
    { key: 'voiced', label: 'Voiced', kind: 'enum', choices: choices('VOICED') },
    { key: 'released', label: 'Released', kind: 'date' },
    { key: 'minage', label: 'Age rating', ...NUM },
    { key: 'resolution', label: 'Resolution', kind: 'resolution' },
    { key: 'ani_story', label: 'Story animation', kind: 'enum', choices: ANIMATION, ordered: true },
    {
      key: 'ani_ero',
      label: 'Erotic scene animation',
      kind: 'enum',
      choices: ANIMATION,
      ordered: true,
    },
    { key: 'engine', label: 'Engine', kind: 'text', hint: 'exact name' },
    { key: 'official', label: 'Official', ...BOOL },
    { key: 'patch', label: 'Patch', ...BOOL },
    { key: 'freeware', label: 'Freeware', ...BOOL },
    { key: 'has_ero', label: 'Has erotic scenes', ...BOOL },
    { key: 'uncensored', label: 'Uncensored', ...BOOL },
    { key: 'drm_free', label: 'DRM-free', ...BOOL },
    { key: 'drm_needs', label: 'DRM requires', kind: 'enum', choices: DRM_NEEDS },
    LINK,
    { key: 'vn', label: 'Visual novel', ...rel('v') },
    { key: 'producer', label: 'Producer', ...rel('p') },
    { key: 'developer', label: 'Developer', ...rel('p') },
    { key: 'publisher', label: 'Publisher', ...rel('p') },
    { key: 'supersedes', label: 'Supersedes', ...on('r') },
  ],
  c: [
    { key: 'search', label: 'Name', ...SEARCH },
    { key: 'role', label: 'Role', kind: 'enum', choices: choices('CHARACTER_ROLE') },
    { key: 'sex', label: 'Sex', kind: 'enum', choices: choices('CHARACTER_SEX') },
    { key: 'gender', label: 'Gender', kind: 'enum', choices: choices('GENDER') },
    { key: 'trait', label: 'Trait', kind: 'scored', target: 'i', score: false },
    { key: 'dtrait', label: 'Trait (not inherited)', kind: 'scored', target: 'i', score: false },
    { key: 'vn', label: 'Visual novel', ...rel('v') },
    { key: 'seiyuu', label: 'Voice actor', ...on('s') },
    { key: 'age', label: 'Age', ...NUM },
    { key: 'birthday', label: 'Birthday', kind: 'text', hint: '12-25, or 12 for a month' },
    { key: 'has_image', label: 'Has a picture', ...BOOL },
    { key: 'is_variant', label: 'Is a variant', ...BOOL },
    { key: 'variant_of', label: 'Variant of', ...on('c') },
    { key: 'height', label: 'Height', kind: 'number', hint: 'cm', unit: 'cm' },
    { key: 'weight', label: 'Weight', kind: 'number', hint: 'kg', unit: 'kg' },
    { key: 'bust', label: 'Bust', kind: 'number', hint: 'cm', unit: 'cm' },
    { key: 'waist', label: 'Waist', kind: 'number', hint: 'cm', unit: 'cm' },
    { key: 'hips', label: 'Hips', kind: 'number', hint: 'cm', unit: 'cm' },
    { key: 'cup', label: 'Cup size', kind: 'text', hint: 'AAA–Z' },
    {
      key: 'blood_type',
      label: 'Blood type',
      kind: 'enum',
      choices: ['a', 'b', 'ab', 'o'].map(v => ({ value: v, label: v.toUpperCase() })),
    },
  ],
  p: [
    { key: 'search', label: 'Name', ...SEARCH },
    { key: 'type', label: 'Type', kind: 'enum', choices: choices('TYPE') },
    { key: 'lang', label: 'Language', ...LANG() },
    { key: 'vn', label: 'Visual novel', ...on('v') },
    { key: 'release', label: 'Release', ...on('r') },
    { key: 'relation', label: 'Related producer', ...on('p') },
    LINK,
  ],
  s: [
    { key: 'search', label: 'Name', ...SEARCH },
    {
      key: 'role',
      label: 'Role',
      kind: 'enum',
      // Voice work is not a credit role, but the staff filter takes it as one.
      choices: [...choices('STAFF_ROLE'), { value: 'seiyuu', label: 'Voice actor' }],
    },
    { key: 'lang', label: 'Language', ...LANG() },
    { key: 'gender', label: 'Gender', kind: 'enum', choices: STAFF_GENDER },
    { key: 'vn', label: 'Credited on', ...on('v') },
    { key: 'voiced', label: 'Voiced in', ...on('v') },
    { key: 'character', label: 'Voiced character', ...on('c') },
    LINK,
  ],
  g: [
    { key: 'search', label: 'Name', ...SEARCH },
    { key: 'category', label: 'Category', kind: 'enum', choices: choices('CATEGORY') },
    { key: 'vn_count', label: 'Visual novels', ...NUM },
    { key: 'parent', label: 'Parent', ...on('g') },
    { key: 'under', label: 'Anywhere under', ...on('g') },
    { key: 'vn', label: 'Visual novel', ...on('v') },
    { key: 'searchable', label: 'Searchable', ...BOOL },
    { key: 'applicable', label: 'Applicable', ...BOOL },
  ],
  i: [
    { key: 'search', label: 'Name', ...SEARCH },
    { key: 'char_count', label: 'Characters', ...NUM },
    { key: 'group', label: 'Group', ...on('i') },
    { key: 'parent', label: 'Parent', ...on('i') },
    { key: 'under', label: 'Anywhere under', ...on('i') },
    { key: 'character', label: 'Character', ...on('c') },
    { key: 'sexual', label: 'Sexual', ...BOOL },
    { key: 'searchable', label: 'Searchable', ...BOOL },
    { key: 'applicable', label: 'Applicable', ...BOOL },
  ],
};

/** The other type a condition is about, or undefined for the item's own
 *  properties. */
export function relatedType(c: Condition | undefined): string | undefined {
  return c &&
    (c.kind === 'relation' || c.kind === 'entity' || c.kind === 'scored' || c.kind === 'credit')
    ? c.target
    : undefined;
}

/** The type a condition can hold a bracketed condition about: relations,
 *  and tags or traits matched by what they are (tag=(search=school)). */
export function nestable(c: Condition | undefined): string | undefined {
  return c && (c.kind === 'relation' || c.kind === 'scored') ? c.target : undefined;
}

export function conditionOf(type: string, key: string): Condition | undefined {
  return CONDITIONS[type]?.find(c => c.key === key);
}

/** Singular names for "a release that…". */
export const NOUN: Record<string, string> = {
  v: 'visual novel',
  r: 'release',
  c: 'character',
  p: 'producer',
  s: 'staff member',
  g: 'tag',
  i: 'trait',
};

/** A tag or trait value: g749, g749:2.0, g749:2.0:1, i568:1. */
export interface Scored {
  id: string;
  score: string;
  spoiler: string;
}

export function readScored(value: string, score: boolean): Scored {
  const [id = '', a = '', b = ''] = value.split(':');
  return score ? { id, score: a, spoiler: b } : { id, score: '', spoiler: a };
}

export function writeScored(v: Scored, score: boolean): string {
  if (!v.id) return '';
  if (!score) return v.spoiler ? `${v.id}:${v.spoiler}` : v.id;
  // Direct tag scores are always positive, so 0 stands in for "any score".
  if (v.spoiler) return `${v.id}:${v.score || '0'}:${v.spoiler}`;
  return v.score ? `${v.id}:${v.score}` : v.id;
}

/** Kinds whose backend filter reads a comma list as "any of". Scored values
 *  carry their own colon syntax per item, so they are left alone. */
const LISTABLE = new Set([
  'enum',
  'site',
  'entity',
  'relation',
  'number',
  'date',
  'resolution',
  'credit',
]);

export const TIDY_RULES: TidyRules = {
  mergeable: (type, name) => LISTABLE.has(conditionOf(type, name)?.kind ?? ''),
  nested: (type, name) => nestable(conditionOf(type, name)),
};

/** A staff credit value: s224 or s224:scenario. */
export function readCredit(value: string): { id: string; role: string } {
  const [id = '', role = ''] = value.split(':');
  return { id, role };
}

export function writeCredit(v: { id: string; role: string }): string {
  if (!v.id) return '';
  return v.role ? `${v.id}:${v.role}` : v.id;
}

/** Plain filters as one f= expression, to hand a listing to the builder. */
export function asExpression(filters: Record<string, string>): string {
  return print(
    group(
      true,
      Object.entries(filters).map(([name, value]) => leaf(name, '=', value)),
    ),
  );
}

/** Items related to anything matching a search: developer=(search=key). */
export function relatedSearch(filter: string, term: string): string {
  return print(group(true, [leaf(filter, '=', group(true, [leaf('search', '=', term)]))]));
}

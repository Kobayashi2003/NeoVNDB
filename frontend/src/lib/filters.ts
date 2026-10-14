/** The filter bar's quick menus per type; everything else is in the condition
 *  builder (lib/conditions.ts). A `multiple` filter joins values with commas,
 *  which the API reads as "any of". */

import { choices, LANGUAGES, PLATFORMS, STAFF_GENDER, type Choice } from './choices';

export type { Choice };

export interface Filter {
  /** The API parameter. */
  key: string;
  label: string;
  choices: Choice[];
  /** Several at once, joined by commas, which the API reads as "any of". */
  multiple?: boolean;
}

/** A yes/no the API spells as a `has_*` parameter. */
function yesNo(key: string, label: string): Filter {
  return {
    key,
    label,
    choices: [
      { value: 'true', label: 'Yes' },
      { value: 'false', label: 'No' },
    ],
  };
}

export const FILTERS: Record<string, Filter[]> = {
  v: [
    { key: 'lang', label: 'Language', choices: LANGUAGES, multiple: true },
    { key: 'platform', label: 'Platform', choices: PLATFORMS, multiple: true },
    { key: 'length', label: 'Length', choices: choices('LENGTH'), multiple: true },
    { key: 'devstatus', label: 'Status', choices: choices('DEVSTATUS'), multiple: true },
    {
      key: 'rating',
      label: 'Rating',
      choices: [80, 70, 60].map(n => ({ value: `>=${n}`, label: `${n} and up` })),
    },
    yesNo('has_screenshot', 'Screenshots'),
    yesNo('has_anime', 'Anime'),
  ],
  c: [
    { key: 'sex', label: 'Sex', choices: choices('CHARACTER_SEX'), multiple: true },
    { key: 'role', label: 'Role', choices: choices('CHARACTER_ROLE'), multiple: true },
  ],
  r: [
    { key: 'lang', label: 'Language', choices: LANGUAGES, multiple: true },
    { key: 'platform', label: 'Platform', choices: PLATFORMS, multiple: true },
    { key: 'medium', label: 'Medium', choices: choices('MEDIUM'), multiple: true },
    { key: 'voiced', label: 'Voiced', choices: choices('VOICED'), multiple: true },
    yesNo('official', 'Official'),
    yesNo('patch', 'Patch'),
    yesNo('freeware', 'Freeware'),
  ],
  p: [
    { key: 'type', label: 'Type', choices: choices('TYPE'), multiple: true },
    { key: 'lang', label: 'Language', choices: LANGUAGES, multiple: true },
  ],
  s: [
    { key: 'lang', label: 'Language', choices: LANGUAGES, multiple: true },
    { key: 'gender', label: 'Gender', choices: STAFF_GENDER, multiple: true },
  ],
  g: [{ key: 'category', label: 'Category', choices: choices('CATEGORY'), multiple: true }],
  i: [],
};

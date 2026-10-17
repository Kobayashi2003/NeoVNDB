/** What the site asks of the read API stays inside the ceilings a deployment
 *  sets (backend/vndb/.env.sample). A checkout runs with them lifted, so a page
 *  that outgrew one only failed once deployed: the VN page asked for fields
 *  four deep under a ceiling of three, and drew nothing. */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import * as FIELDS from '@/lib/fields';
import { LIST } from '@/lib/list';

const sample = readFileSync(
  fileURLToPath(new URL('../../../backend/vndb/.env.sample', import.meta.url)),
  'utf8',
);
const ceiling = (name: string) => Number(new RegExp(`^${name}=(\\d+)`, 'm').exec(sample)?.[1]);

const asked: [string, string][] = [
  ...Object.entries(FIELDS).map(([name, v]) => [name, String(v)] as [string, string]),
  ...Object.entries(LIST).map(([type, spec]) => [`LIST.${type}`, spec.fields] as [string, string]),
];

describe('the fields each page asks for', () => {
  const depth = ceiling('NEOVNDB_MAX_FIELD_DEPTH');

  it('has a ceiling to compare with', () => {
    expect(depth).toBeGreaterThan(0);
  });

  for (const [name, fields] of asked) {
    it(`${name} nests no deeper than a deployment allows`, () => {
      const deepest = fields
        .split(',')
        .map(f => f.trim())
        .filter(Boolean)
        .reduce((most, f) => Math.max(most, f.split('.').length), 0);
      expect(deepest).toBeLessThanOrEqual(depth);
    });
  }
});

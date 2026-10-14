/** How condition values read in a chip. */

export const values = (value: string) =>
  value
    .split(',')
    .map(v => v.trim())
    .filter(Boolean);

export function listed(labels: string[], not: boolean): string {
  if (labels.length === 1) return not ? `not ${labels[0]}` : labels[0];
  return not ? `none of ${labels.join(', ')}` : labels.join(' or ');
}

import { expect, test } from '@playwright/test';

test('the API describes itself, from the tables that serve it', async ({ page, request }) => {
  const doc = await (await request.get('/vndbserve/meta/openapi')).json();
  expect(doc.openapi).toBe('3.1.0');
  const vnFilters = doc.paths['/vn'].get.parameters.filter(
    (p: { 'x-filter'?: boolean }) => p['x-filter'],
  );
  expect(vnFilters.map((p: { name: string }) => p.name)).toContain('cover_sexual');

  // Reached from the footer of a list page.
  await page.goto('/v');
  await page.getByRole('link', { name: 'API', exact: true }).click();
  await expect(page).toHaveURL(/\/api$/);
  await expect(page.locator('details')).toHaveCount(7);

  // A type opens to its filters, labelled from the condition builder.
  await page.locator('summary', { hasText: 'Visual Novels' }).click();
  const row = page.locator('tr', { has: page.locator('code', { hasText: /^cover_sexual$/ }) });
  await expect(row).toContainText('Cover: sexual content');
  await expect(row).toContainText('safe, suggestive, explicit');
});

// By weight, not as text, where "appears" would come before "main".
test("a work's characters come main roles first", async ({ request }) => {
  const res = await request.get('/vndbserve/vn?id=v17&fields=characters.role');
  const { results } = (await res.json()) as { results: { characters: { role: string }[] }[] };
  const weight = ['main', 'primary', 'side', 'appears'];
  const order = results[0].characters.map(c => weight.indexOf(c.role));
  expect(order.length).toBeGreaterThan(1);
  expect(order).toEqual([...order].sort((a, b) => a - b));
});

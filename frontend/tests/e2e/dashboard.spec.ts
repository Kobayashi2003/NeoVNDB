import { expect, test } from './fixtures';

test('the dashboard counts what the reader holds and suggests more', async ({ page, user }) => {
  const list = (await (
    await user.call('POST', '/collections', { type: 'v', name: 'Read' })
  ).json()) as { id: number };
  await user.call('POST', `/collections/${list.id}/marks/add`, { items: ['v17', 'v11', 'v2'] });
  await user.call('PUT', '/ratings/v17', { rating: 5 });
  await user.call('PUT', '/ratings/v11', { rating: 2 });

  await page.goto('/u/dashboard');
  const tile = (label: string) => page.locator('dl > div', { hasText: label }).locator('dd');
  await expect(tile('Titles')).toHaveText('3');
  await expect(tile('Rated')).toHaveText(/^2/);
  await expect(tile('Your average')).toHaveText('★3.50');

  // What they have in common comes from the read API's aggregate.
  const developers = page.locator('section', {
    has: page.getByRole('heading', { name: 'Developers' }),
  });
  await expect(developers.getByRole('link').first()).toHaveAttribute('href', /^\/p\d+$/);

  // Every chart has its numbers as a table too.
  const added = page.locator('section', { has: page.getByRole('heading', { name: 'Added' }) });
  await added.getByRole('button', { name: 'Show as a table' }).click();
  await expect(added.locator('tbody tr')).toHaveCount(1);
  await expect(added.locator('tbody td').nth(1)).toHaveText('3');

  // Picking a column narrows everything else to the titles under it, and the
  // titles section lists them; its chip undoes it.
  await page
    .getByRole('group', { name: 'Titles by your rating' })
    .getByRole('button', { name: /^5 stars/ })
    .click();
  await expect(tile('Titles')).toHaveText('1');
  const titles = page.locator('section', { has: page.getByRole('heading', { name: /^Titles/ }) });
  await expect(titles.locator('a[href="/v17"]')).toBeVisible();
  await expect(titles.locator('a[href="/v11"]')).toHaveCount(0);
  await page.getByRole('button', { name: 'Stop narrowing to Rated ★5' }).click();
  await expect(tile('Titles')).toHaveText('3');

  // Scoped to what was rated, the counts follow.
  await page.getByRole('button', { name: /^Titles:/ }).click();
  await page.getByRole('button', { name: /^Rated/ }).click();
  await expect(tile('Titles')).toHaveText('2');

  // Suggestions leave out what the reader already holds.
  // The cards, not the "Like ..." lines under them, which name held titles.
  const liked = page.locator('section', {
    has: page.getByRole('heading', { name: 'You might like' }),
  });
  const cards = liked.locator('.grid > div > a');
  await expect(cards.first()).toBeVisible();
  const suggested = await cards.evaluateAll(as => as.map(a => a.getAttribute('href')));
  expect(suggested.filter(h => ['/v17', '/v11', '/v2'].includes(h!))).toEqual([]);
});

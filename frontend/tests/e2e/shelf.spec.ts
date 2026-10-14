import { expect, test } from './fixtures';

test("a list orders by the reader's rating and shows it on the cards", async ({ page, user }) => {
  const list = (await (
    await user.call('POST', '/collections', { type: 'v', name: 'Rated' })
  ).json()) as { id: number };
  await user.call('POST', `/collections/${list.id}/marks/add`, { items: ['v17', 'v11', 'v2'] });
  await user.call('PUT', '/ratings/v11', { rating: 5 });
  await user.call('PUT', '/ratings/v17', { rating: 2 });

  await page.goto(`/u/${list.id}?sort=mine`);
  const cards = page.locator("[data-results] a[href^='/v']");
  await expect(cards).toHaveCount(3);
  // Highest first, the unrated last.
  await expect(cards.nth(0)).toHaveAttribute('href', '/v11');
  await expect(cards.nth(1)).toHaveAttribute('href', '/v17');
  await expect(cards.nth(2)).toHaveAttribute('href', '/v2');
  await expect(page.getByTitle('Your rating: 5')).toBeVisible();
});

test('moving between lists redraws the list, not the column beside it', async ({ page, user }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const first = (await (
    await user.call('POST', '/collections', { type: 'v', name: 'First' })
  ).json()) as { id: number };
  const second = (await (
    await user.call('POST', '/collections', { type: 'v', name: 'Second' })
  ).json()) as { id: number };
  await user.call('POST', `/collections/${first.id}/marks/add`, { items: ['v17'] });
  await user.call('POST', `/collections/${second.id}/marks/add`, { items: ['v11'] });

  await page.goto(`/u/${first.id}`);
  await expect(page.locator("[data-results] a[href='/v17']")).toBeVisible();
  const column = page.getByRole('navigation', { name: 'Your lists' });
  await column.evaluate(el => ((window as unknown as { column: Element }).column = el));

  await column.getByRole('link', { name: /Second/ }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Second');
  await expect(page.locator("[data-results] a[href='/v11']")).toBeVisible();
  expect(
    await page.evaluate(() => document.contains((window as unknown as { column: Element }).column)),
  ).toBe(true);
});

test('ratings are changed several at once on the ratings page', async ({ page, user }) => {
  await user.call('PUT', '/ratings/v17', { rating: 3 });
  await user.call('PUT', '/ratings/v11', { rating: 4 });

  await page.goto('/u/ratings');
  await expect(page.locator("[data-results] a[href^='/v']")).toHaveCount(2);

  await page.getByRole('button', { name: 'Select', exact: true }).click();
  await page.getByRole('button', { name: 'Select this page' }).click();
  await page.getByRole('button', { name: 'Rate them 5' }).click();
  await expect(page.getByTitle('Your rating: 5')).toHaveCount(2);

  const rated = async () =>
    (
      (await (await user.call('GET', '/ratings/items?type=v')).json()) as {
        items: { id: string; rating: number }[];
      }
    ).items;
  expect((await rated()).map(r => r.rating)).toEqual([5, 5]);

  await page.getByRole('button', { name: 'Select this page' }).click();
  await page.getByTitle('Clear their ratings').click();
  await page.getByRole('button', { name: 'Yes, clear their ratings' }).click();
  await expect(page.getByText('No visual novels rated yet.', { exact: false })).toBeVisible();
  expect(await rated()).toEqual([]);
});

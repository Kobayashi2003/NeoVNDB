import { expect, test } from './fixtures';
import { midway } from './transition';

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

  // Ordered by when they were added, the cards say when; by rating, they do not.
  await page.goto(`/u/${list.id}?sort=added`);
  await expect(cards).toHaveCount(3);
  // The service's own time zone decides the day, so any date will do.
  const added = page.getByTitle(/^Added: \d{4}-\d{2}-\d{2}$/);
  await expect(added).toHaveCount(3);
  await page.goto(`/u/${list.id}?sort=mine`);
  await expect(cards).toHaveCount(3);
  await expect(added).toHaveCount(0);
});

test('a list ordered by a vndb field pages through it, not the whole list on every page', async ({
  page,
  user,
}) => {
  const list = (await (
    await user.call('POST', '/collections', { type: 'v', name: 'Long' })
  ).json()) as { id: number };
  // Thirty well-known works: more than a page of 24.
  const items = Array.from({ length: 30 }, (_, i) => `v${i + 1}`);
  await user.call('POST', `/collections/${list.id}/marks/add`, { items });

  const ids = async (url: string) => {
    await page.goto(url);
    const cards = page.locator("[data-results] a[href^='/v']");
    await expect(cards.first()).toBeVisible();
    return cards.evaluateAll(as => as.map(a => a.getAttribute('href')));
  };
  const first = await ids(`/u/${list.id}?sort=rating&reverse=true`);
  const second = await ids(`/u/${list.id}?sort=rating&reverse=true&page=2`);
  expect(first).toHaveLength(24);
  expect(second.length).toBeGreaterThan(0);
  expect(second.length).toBeLessThanOrEqual(6);
  expect(second.filter(id => first.includes(id))).toEqual([]);
});

test('paging a list holds its heading and controls still', async ({ page, user }) => {
  const list = (await (
    await user.call('POST', '/collections', { type: 'v', name: 'Paged' })
  ).json()) as { id: number };
  await user.call('POST', `/collections/${list.id}/marks/add`, {
    items: Array.from({ length: 30 }, (_, i) => `v${i + 1}`),
  });
  await page.goto(`/u/${list.id}`);
  await expect(page.locator("[data-results] a[href^='/v']").first()).toBeVisible();
  // The element drawn as its own still layer, kept on the window to compare.
  const sameHead = (name: string) =>
    page.evaluate(name => {
      const w = window as { head?: Element };
      const now = [...document.querySelectorAll('main *')].find(
        e => getComputedStyle(e).viewTransitionName === name,
      );
      const same = !!now && (w.head ?? now) === now;
      w.head = now;
      return same;
    }, name);
  expect(await sameHead(`still-head-u-${list.id}`)).toBe(true);

  await page.getByRole('navigation', { name: 'Pages' }).getByRole('link', { name: '2' }).click();
  await expect(page).toHaveURL(/page=2/);
  expect(await sameHead(`still-head-u-${list.id}`)).toBe(true);
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

  // Nor redrawn to the eye: the list fades, the column stands as it is now.
  await page.waitForLoadState('networkidle');
  const { held } = await midway(page, () => column.getByRole('link', { name: /Second/ }).click());
  expect(held.lists).toEqual({ old: 0, new: 1 });
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Second');
  await expect(page.locator("[data-results] a[href='/v11']")).toBeVisible();
  expect(
    await page.evaluate(() => document.contains((window as unknown as { column: Element }).column)),
  ).toBe(true);
});

test('the page of lists and a list fade into each other without scaling', async ({
  page,
  user,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await user.call('POST', '/collections', { type: 'v', name: 'Kept' });

  // /u is a narrower column than a list's page: the old page was drawn at the
  // new one's width, one frame blown up going in and shrunk coming out.
  await page.goto('/u', { waitUntil: 'networkidle' });
  let { before, held } = await midway(page, () => page.getByRole('link', { name: 'Kept' }).click());
  expect(held.page).toEqual(before);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Kept');

  await page.waitForLoadState('networkidle');
  ({ before, held } = await midway(page, () =>
    page.getByRole('link', { name: 'Manage lists' }).click(),
  ));
  expect(held.page).toEqual(before);
  await expect(page).toHaveURL(/\/u$/);
});

test('a choice on a list is gathered across its pages', async ({ page, user }) => {
  const list = (await (
    await user.call('POST', '/collections', { type: 'v', name: 'Paged' })
  ).json()) as { id: number };
  // More than a page of 24.
  await user.call('POST', `/collections/${list.id}/marks/add`, {
    items: Array.from({ length: 30 }, (_, i) => `v${i + 1}`),
  });

  await page.goto(`/u/${list.id}`);
  const cards = page.locator('[data-results] button[aria-pressed]');
  await page.getByRole('button', { name: 'Select', exact: true }).click();
  await cards.nth(0).click();
  await cards.nth(1).click();
  await expect(page.getByText('2 selected')).toBeVisible();

  await page.locator('nav[aria-label="Pages"] a[aria-label="Next"]').click();
  await expect(page).toHaveURL(/page=2/);
  await expect(cards).toHaveCount(6);
  await expect(page.getByText('2 selected')).toBeVisible();
  // This page in, beside the two from the first; and out again, leaving them.
  await page.getByRole('button', { name: 'Select this page' }).click();
  await expect(page.getByText('8 selected')).toBeVisible();
  await page.getByRole('button', { name: 'Deselect this page' }).click();
  await expect(page.getByText('2 selected')).toBeVisible();
  await cards.nth(0).click();

  // Back on the first page, its two are still marked.
  await page.locator('nav[aria-label="Pages"] a[aria-label="Previous"]').click();
  await expect(page).not.toHaveURL(/page=/);
  await expect(page.locator('[data-results] button[aria-pressed="true"]')).toHaveCount(2);
  await expect(page.getByText('3 selected')).toBeVisible();

  // Asked with the count, since one of them is not on this page.
  await page.getByTitle('Remove from this list').click();
  await expect(page.getByText('Remove 3?')).toBeVisible();
  await page.getByRole('button', { name: 'Yes, remove them' }).click();
  await expect(page.locator('h1 + span')).toHaveText('27');
  await expect(page.getByText('0 selected')).toBeVisible();
});

test('ratings are changed several at once on the ratings page', async ({ page, user }) => {
  await user.call('PUT', '/ratings/v17', { rating: 3 });
  await user.call('PUT', '/ratings/v11', { rating: 4 });

  await page.goto('/u/ratings?view=ratings');
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

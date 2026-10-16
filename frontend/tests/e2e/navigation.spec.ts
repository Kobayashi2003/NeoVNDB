import { expect, test } from '@playwright/test';

const sections = (page: import('@playwright/test').Page) =>
  page.getByRole('navigation', { name: 'Sections' });

test('a detail page maps its sections and goes to one', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/v17');
  await expect(sections(page).getByRole('link')).toHaveText([
    'Description',
    /^Tags\s*\d+/,
    /^Characters\s*\d+/,
    /^Staff\s*\d+/,
    /^Releases\s*\d+/,
    /^Screenshots\s*\d+/,
    /^Similar\s*20/,
  ]);
  await sections(page)
    .getByRole('link', { name: /Releases/ })
    .click();
  await expect(sections(page).locator('[aria-current]')).toHaveText(/Releases/);
  // The heading arrives just under the row, which has stuck to the top.
  await expect
    .poll(async () => (await page.locator('#releases').boundingBox())?.y ?? 9999)
    .toBeLessThan(200);
  await expect(sections(page)).toBeInViewport();
});

test('the section row also works on a phone, under the site header', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/v17');
  await sections(page).getByRole('link', { name: /Staff/ }).click();
  await expect(sections(page).locator('[aria-current]')).toHaveText(/Staff/);
  const header = await page.locator('header').first().boundingBox();
  const row = await sections(page).boundingBox();
  expect(row!.y).toBeGreaterThanOrEqual(header!.y + header!.height - 1);
});

test('similar works scroll sideways, a page at a time', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/v17#similar');
  const more = page.getByRole('button', { name: 'More similar works' });
  const back = page.getByRole('button', { name: 'Earlier similar works' });
  await expect(back).toBeDisabled();
  await more.click();
  await expect(back).toBeEnabled();
  // One row, however many there are.
  const tops = await page
    .locator('#similar a[href^="/v"]')
    .evaluateAll(cards => new Set(cards.map(c => Math.round(c.getBoundingClientRect().top))).size);
  expect(tops).toBe(1);
});

test('a search with one match goes straight to it', async ({ page }) => {
  await page.goto('/q?q=mochizuki%20hisayo');
  await expect(page).toHaveURL(/\/s\d+$/);
});

test('release rows keep their titles in line', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/r');
  const lefts = await page
    .locator('[data-results] a[href^="/r"], main a[href^="/r"]')
    .evaluateAll(rows =>
      rows.slice(0, 20).map(row => {
        const title = row.querySelector('span.block');
        return title ? Math.round(title.getBoundingClientRect().left) : null;
      }),
    );
  expect(new Set(lefts.filter(x => x !== null)).size).toBe(1);
});

test('a filter menu says how many each choice would leave', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/v?length=3');
  await page.locator('button[aria-expanded]:visible', { hasText: 'Platform' }).click();
  const windows = page.getByRole('link', { name: /^Windows/ });
  await expect(windows).toHaveText(/Windows\s*[\d,]+/);
  // The number is the count the listing shows once that choice is made.
  const shown = (await windows.textContent())!.replace(/\D/g, '');
  await windows.click();
  await expect(page.locator('h1')).toContainText(Number(shown).toLocaleString('en-US'));
});

test('the relation graph lists only the steps worth taking', async ({ page }) => {
  // v5390's graph ends five steps out, so asking for eleven shows the fifth.
  await page.goto('/v5390/rg?depth=11');
  const steps = page.getByRole('navigation', { name: 'Steps out' });
  await expect(steps.getByRole('link')).toHaveCount(5);
  await expect(steps.locator('[aria-current=page]')).toHaveText('5');
  await expect(page.getByText(/nothing further out/)).toBeVisible();
});

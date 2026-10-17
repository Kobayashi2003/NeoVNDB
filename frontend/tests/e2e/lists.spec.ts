import { expect, test } from '@playwright/test';

const pages = (page: import('@playwright/test').Page) => page.locator('nav[aria-label="Pages"]');

test('the page gap jumps anywhere and clamps', async ({ page }) => {
  await page.goto('/v');
  const jump = async (value: string) => {
    await pages(page).getByRole('button', { name: 'Go to page' }).first().click();
    const box = pages(page).locator('input[name=page]');
    await box.fill(value);
    await box.press('Enter');
  };
  await jump('1400');
  await expect(page).toHaveURL(/page=1400/);
  await expect(pages(page).locator('[aria-current=page]')).toHaveText('1400');

  await jump('0');
  await expect(page).not.toHaveURL(/page=/);

  // Escape closes the box without going anywhere.
  await pages(page).getByRole('button', { name: 'Go to page' }).first().click();
  await page.keyboard.press('Escape');
  await expect(pages(page).locator('input[name=page]')).toHaveCount(0);
});

test('menus move with the arrow keys', async ({ page }) => {
  // Keys are handled once the page is live; a click before that opens the menu
  // from the server's markup with nothing listening yet.
  await page.goto('/v', { waitUntil: 'networkidle' });
  await page.locator('button[aria-expanded]:visible', { hasText: 'Length' }).click();
  await page.keyboard.press('ArrowDown');
  await expect(page.locator(':focus')).toHaveText(/Very Short/);
  await page.keyboard.press('ArrowDown');
  await expect(page.locator(':focus')).toHaveText(/^Short/);
  await page.keyboard.press('End');
  await page.keyboard.press('ArrowDown'); // wraps
  await expect(page.locator(':focus')).toHaveText(/Very Short/);
  await page.keyboard.press('Escape');
});

test('a tag can be asked for by what it is', async ({ page }) => {
  await page.goto('/v');
  await page.locator('button[aria-expanded]:visible', { hasText: 'Conditions' }).click();
  await page.getByRole('button', { name: 'Add a condition' }).click();
  await page.getByRole('button', { name: /^Tag/ }).first().click();
  await page.getByRole('button', { name: 'has one with…' }).click();
  await page.keyboard.type('categ');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: /Sexual Content/ }).click();
  await page.getByRole('button', { name: 'Done' }).click();
  await page.getByRole('button', { name: 'Apply' }).click();
  await expect(page).toHaveURL(/f=tag%3D%28category%3Dero%29/);
  await expect(page.locator('h1')).toContainText(/\d/);
});

test('a filter the backend refuses says why', async ({ request }) => {
  const res = await request.get('/vndbserve/vn?fields=id&cover_sexual=bogus');
  expect(res.status()).toBe(400);
  expect((await res.json()).error).toContain('not a level');
});

import { expect, test } from '@playwright/test';
import { midway } from './transition';

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
  // v5390's graph ends five steps out, so asking for eight shows the fifth.
  // Eight, the deepest a deployment allows; a checkout allows any.
  await page.goto('/v5390/rg?depth=8', { waitUntil: 'networkidle' });
  const steps = page.getByRole('navigation', { name: 'Steps out' });
  await expect(steps.getByRole('link')).toHaveCount(5);
  await expect(steps.locator('[aria-current=page]')).toHaveText('5');
  await expect(page.getByText(/nothing further out/)).toBeVisible();
  await expect(page.getByLabel('Deepest, 5 steps out')).toHaveAttribute('aria-disabled');

  // v84's ends three steps out: at the default two, three are offered, not a
  // stock five, and Deepest goes straight to the third.
  await page.goto('/v84/rg', { waitUntil: 'networkidle' });
  await expect(steps.getByRole('link')).toHaveCount(3);
  await expect(steps.locator('[aria-current=page]')).toHaveText('2');
  await page.getByRole('link', { name: 'Deepest, 3 steps out' }).click();
  await expect(page).toHaveURL(/depth=3/);
  await expect(steps.locator('[aria-current=page]')).toHaveText('3');
});

test('the keys page through a list and move about a page', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  // The keys are the page's once it is live.
  await page.goto('/v', { waitUntil: 'networkidle' });
  await page.keyboard.press('ArrowRight');
  await expect(page).toHaveURL(/page=2/);
  await page.keyboard.press('ArrowLeft');
  await expect(page).not.toHaveURL(/page=/);

  await page.keyboard.press('/');
  await expect(page.locator('main input[type="search"]')).toBeFocused();
  // Typing in it is typing, not paging.
  await page.keyboard.press('ArrowRight');
  await expect(page).not.toHaveURL(/page=/);

  await page.goto('/v17', { waitUntil: 'networkidle' });
  await page.keyboard.press('j');
  await expect(sections(page).locator('[aria-current]')).toHaveText(/Tags/);
  await page.keyboard.press('?');
  await expect(page.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('a page left scrolled down fades where it was, under the header', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/v', { waitUntil: 'networkidle' });
  await page.mouse.move(700, 500);
  await page.mouse.wheel(0, 1500);
  await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(500);
  const { before, held } = await midway(page, () =>
    page.locator('header a[href="/c"]').first().click(),
  );
  // Not jumped to the top of the old page as the new one scrolls up.
  expect(held.page).toEqual(before);
  expect(held.header).toBeGreaterThan(0);
});

test('a button takes a page scrolled down back to the top', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const toTop = page.getByRole('button', { name: 'Back to the top' });

  // A list scrolls the window.
  await page.goto('/v', { waitUntil: 'networkidle' });
  await expect(toTop).not.toBeVisible();
  await page.mouse.move(700, 500);
  await page.mouse.wheel(0, 1500);
  await expect(toTop).toBeVisible();
  await toTop.click();
  await expect.poll(() => page.evaluate(() => scrollY)).toBe(0);
  await expect(toTop).not.toBeVisible();

  // A detail page scrolls its own column.
  await page.goto('/v17', { waitUntil: 'networkidle' });
  const column = page.locator('[data-scroll-top]');
  await page.mouse.move(900, 500);
  await page.mouse.wheel(0, 2500);
  await expect(toTop).toBeVisible();
  await toTop.click();
  await expect.poll(() => column.evaluate(c => c.scrollTop)).toBe(0);
  await expect(page.locator('main h1')).toBeFocused();

  // Leaving with the column scrolled down: it goes with the page, and nothing
  // scrolls on the way to the next one, which is at its top.
  await page.mouse.move(900, 500);
  await page.mouse.wheel(0, 2500);
  await expect(toTop).toBeVisible();
  await page.locator('header a[href="/c"]').first().click();
  await expect(page).toHaveURL(/\/c$/);
  await expect(toTop).not.toBeVisible();
});

test('leaving a page drops the images still loading on it', async ({ page }) => {
  // Covers the mirror has not fetched yet, held open. Over HTTP/1.1 six of these
  // used to hold every connection, and the next page waited behind them.
  await page.route('**/imgserve/img/**', () => new Promise(() => {}));
  // Neither load nor network idle comes while they hang. The click is only
  // seen once the progress bar (components/layout/Navigation.tsx) is hydrated.
  await page.goto('/v', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => {
    const bar = document.querySelector('[class*="z-[70]"]');
    return !!bar && Object.keys(bar).some(k => k.startsWith('__reactFiber'));
  });
  const loading = await page.evaluate(() => {
    const held = [...document.images].filter(i => !i.complete && i.getAttribute('src'));
    (window as unknown as { held: HTMLImageElement[] }).held = held;
    return held.length;
  });
  expect(loading).toBeGreaterThan(0);

  await page.locator('header a[href="/p"]').first().click();
  await expect(page.locator('h1')).toContainText('Producers');
  expect(
    await page.evaluate(
      () =>
        (window as unknown as { held: HTMLImageElement[] }).held.filter(i => i.hasAttribute('src'))
          .length,
    ),
  ).toBe(0);
});

test('moving to another page fades one into the next', async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as { transitions: number };
    w.transitions = 0;
    const start = document.startViewTransition?.bind(document);
    if (start)
      document.startViewTransition = ((...a: Parameters<typeof start>) => {
        w.transitions++;
        return start(...a);
      }) as typeof start;
  });
  await page.goto('/v');
  const before = await page.evaluate(
    () => (window as unknown as { transitions: number }).transitions,
  );
  await page.locator('nav[aria-label="Pages"] a[aria-label="Next"]').click();
  await expect(page).toHaveURL(/page=2/);
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { transitions: number }).transitions))
    .toBeGreaterThan(before);
});

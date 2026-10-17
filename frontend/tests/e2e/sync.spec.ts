/** What follows a reader between devices: preferences and named searches.
 *  Each test's browser is a device that has never seen the account. */
import type { BrowserContext } from '@playwright/test';
import { expect, test } from './fixtures';

async function cookiePrefs(context: BrowserContext): Promise<Record<string, unknown>> {
  const found = (await context.cookies()).find(c => c.name === 'neovndb.prefs');
  return found ? (JSON.parse(decodeURIComponent(found.value)) as Record<string, unknown>) : {};
}

test('a device signing in takes on the account’s preferences, and sends its changes', async ({
  page,
  context,
  user,
}) => {
  expect((await user.call('PUT', '/me/prefs', { spoiler: 2, violence: 'violent' })).status).toBe(
    204,
  );

  await page.goto('/v', { waitUntil: 'networkidle' });
  await expect.poll(async () => (await cookiePrefs(context)).spoiler).toBe(2);
  expect((await cookiePrefs(context)).violence).toBe('violent');

  await page.getByRole('button', { name: /^What to show/ }).click();
  await page.getByRole('radio', { name: 'Brutal' }).click();
  await expect
    .poll(async () => {
      const saved = (await (await user.call('GET', '/me/prefs')).json()) as {
        prefs: Record<string, unknown>;
      };
      return saved.prefs.violence;
    })
    .toBe('brutal');
});

test('an account with no preferences yet is given this device’s', async ({
  page,
  context,
  baseURL,
  user,
}) => {
  await context.addCookies([
    {
      name: 'neovndb.prefs',
      value: encodeURIComponent(JSON.stringify({ original: true })),
      domain: new URL(baseURL!).hostname,
      path: '/',
    },
  ]);
  await page.goto('/v', { waitUntil: 'networkidle' });
  await expect
    .poll(async () => {
      const saved = (await (await user.call('GET', '/me/prefs')).json()) as {
        prefs: Record<string, unknown> | null;
      };
      return saved.prefs?.original;
    })
    .toBe(true);
});

test('a search is named on its listing, opened from another, and deleted', async ({
  page,
  user,
}) => {
  await page.goto('/v?search=ever&lang=en&page=2', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Saved searches' }).click();
  await page.getByRole('button', { name: 'Save this search' }).click();
  await page.getByLabel('Search name').fill('Ever in English');
  await page.getByLabel('Search name').press('Enter');
  await expect(page.getByRole('link', { name: 'Ever in English' })).toHaveAttribute(
    'aria-current',
    'page',
  );

  // Kept on the account without its page, the keys in a fixed order.
  const saved = (await (await user.call('GET', '/searches?type=v')).json()) as {
    results: { query: string }[];
  };
  expect(saved.results.map(s => s.query)).toEqual(['lang=en&search=ever']);

  await page.goto('/v', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Saved searches' }).click();
  await page.getByRole('link', { name: 'Ever in English' }).click();
  await expect(page).toHaveURL(/\/v\?lang=en&search=ever$/);

  await page.getByRole('button', { name: 'Saved searches' }).click();
  await page.getByRole('button', { name: 'Delete Ever in English' }).click();
  await expect(page.getByRole('link', { name: 'Ever in English' })).toHaveCount(0);
  await expect
    .poll(
      async () =>
        ((await (await user.call('GET', '/searches?type=v')).json()) as { results: unknown[] })
          .results.length,
    )
    .toBe(0);
});

test('signed out, a listing still remembers this device’s recent searches', async ({ page }) => {
  await page.goto('/p?search=key', { waitUntil: 'networkidle' });
  // Ordering alone is not a search.
  await page.goto('/p?sort=title', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Saved searches' }).click();
  await expect(page.getByText('Recent on this device')).toBeVisible();
  const recent = page.getByRole('link', { name: '“key”' });
  await expect(recent).toHaveAttribute('href', '/p?search=key');
  await expect(
    page.locator('p', { hasText: 'to name searches' }).getByRole('link', { name: 'Sign in' }),
  ).toBeVisible();
  await expect(page.getByRole('link', { name: 'sort=title' })).toHaveCount(0);
});

import { expect, test } from './fixtures';

test("the services' admin routes are closed to anyone not signed in", async ({ request }) => {
  for (const path of [
    '/vndbserve/admin/status',
    '/imgserve/admin/status',
    '/userserve/admin/users',
  ]) {
    expect((await request.get(path)).status(), path).toBe(401);
  }
  expect((await request.post('/vndbserve/admin/update')).status()).toBe(401);
});

test('a reader who is not an administrator is turned away', async ({ page, user }) => {
  await page.goto('/admin');
  await expect(page.getByRole('heading', { name: 'Administrators only' })).toBeVisible();
  // What the edge asks before letting anyone through to the other services.
  expect((await user.call('GET', '/auth/admin')).status).toBe(403);
  expect((await user.call('GET', '/admin/users')).status).toBe(403);
});

test('an administrator sees the mirror, the accounts and the translations on one page', async ({
  page,
  admin,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: admin.name }).click();
  await page.getByRole('link', { name: 'Administration' }).click();
  await expect(page).toHaveURL(/\/admin$/);

  // Mirror: the live generation and every scheduled job's card.
  await expect(page.getByRole('cell', { name: 'vndb', exact: true })).toBeVisible();
  for (const card of ['Update', 'Images', 'User database backups']) {
    await expect(page.getByRole('heading', { name: card })).toBeVisible();
  }

  // The groups are listed in a row that jumps to each.
  const nav = page.getByRole('navigation', { name: 'Sections' });
  await expect(nav.getByRole('link')).toHaveText(['Mirror', 'Accounts', 'Translations']);

  // Accounts: this one, marked as the reader's own.
  await nav.getByRole('link', { name: 'Accounts' }).click();
  await expect(page.getByRole('heading', { name: 'Accounts', level: 2 })).toBeInViewport();
  const row = page.getByRole('row', { name: new RegExp(admin.name) });
  await expect(row.getByText('you')).toBeVisible();

  // Translations: tags with their names, filtered to what is missing.
  await nav.getByRole('link', { name: 'Translations' }).click();
  await expect(page.getByRole('heading', { name: 'Translations', level: 2 })).toBeInViewport();
  await expect(page.getByText(/\d[\d,]* tags: /)).toBeVisible();
  await page.getByLabel('Untranslated only').uncheck();
  await expect(page.getByLabel('Name translation').first()).toBeVisible();

  // A description that loses its markup is refused, and nothing is stored.
  const refused = await page.request.put('http://127.0.0.1:17031/admin/trans', {
    data: { category: 'trait', id: 1162, field: 'description', target: 'リンクを落とした訳' },
  });
  expect(refused.status()).toBe(400);
});

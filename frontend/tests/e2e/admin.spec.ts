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

test('an administrator changes a setting while the service runs, then puts .env back', async ({
  page,
  admin,
}) => {
  // Against the running site this would change the real service's settings.
  test.skip(!process.env.E2E_DEPLOYED, 'changes settings; only on the deployment check');
  void admin;
  await page.goto('/admin');

  const kept = page.getByLabel('Archives kept');
  await expect(kept).toHaveValue('2');
  await kept.fill('3');
  const saved = page.waitForResponse(r => r.url().endsWith('/vndbserve/admin/settings'));
  await page.getByRole('button', { name: 'Save' }).click();
  expect((await saved).status()).toBe(200);
  await expect(page.getByText('Set here; .env says 2.')).toBeVisible();
  // The Update card reads the service again and shows the new count.
  await expect(page.getByText('the newest 3 are kept after each update')).toBeVisible();

  await page.getByRole('button', { name: "Use .env's" }).click();
  await expect(kept).toHaveValue('2');
  await expect(page.getByText('Set here; .env says 2.')).toBeHidden();

  // A value the service refuses comes back as its reason, and nothing changes.
  const refused = await page.request.patch('/vndbserve/admin/settings', {
    data: { update_every: '5s' },
  });
  expect(refused.status()).toBe(400);
  expect((await refused.json()).error).toContain('update_every');
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
  for (const card of [
    'Update',
    'Images',
    'User database backups',
    'All ages',
    'Update settings',
    'Image settings',
  ]) {
    await expect(page.getByRole('heading', { name: card, exact: true })).toBeVisible();
  }
  // The all-ages switch, as two choices in sight.
  await expect(
    page.getByRole('radiogroup', { name: 'Who sees only what is for all ages' }),
  ).toBeVisible();

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

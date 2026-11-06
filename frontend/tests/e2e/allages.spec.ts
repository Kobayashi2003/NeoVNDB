import { expect, test } from './fixtures';

/** A work all-ages mode holds back: Saya no Uta has nothing but 18+ releases. */
const WITHHELD = '/v97';

// Only once the live generation has its all-ages list (the admin page's All
// ages card); before that nobody is masked, by design.
test.beforeEach(async ({ request }) => {
  const viewer = await (await request.get('/vndbserve/meta/viewer')).json();
  test.skip(!viewer.ready, 'the live generation has no all-ages list yet');
});

test('a guest is answered for all ages, and told why', async ({ page, request }) => {
  const viewer = await (await request.get('/vndbserve/meta/viewer')).json();
  expect(viewer).toMatchObject({ masked: true, reason: 'guest' });

  await page.goto('/v');
  await page.getByRole('button', { name: 'What to show' }).click();
  await expect(page.getByText(/Sign in to choose what else to see/)).toBeVisible();
  await expect(page.getByRole('radiogroup', { name: 'Sexual content' })).toHaveCount(0);
});

test('a held-back entry says so to a guest, and is there for a member', async ({
  page,
  member,
  browser,
  baseURL,
}) => {
  void member;
  // The fixture signed this context in; a fresh one is a guest.
  const context = await browser.newContext({ baseURL });
  const guest = await context.newPage();
  await guest.goto(WITHHELD);
  await expect(guest.getByRole('heading', { name: 'Not shown in all-ages mode' })).toBeVisible();
  // The page's own, not the header's, which comes back to wherever it is.
  await expect(guest.getByRole('main').getByRole('link', { name: 'Sign in' })).toHaveAttribute(
    'href',
    `/login?next=${encodeURIComponent(WITHHELD)}`,
  );
  // An address that names nothing is still not found.
  await guest.goto('/v99999999');
  await expect(guest.getByRole('heading', { name: 'Nothing here' })).toBeVisible();
  await context.close();

  await page.goto(WITHHELD);
  await expect(page.getByRole('heading', { level: 1 })).toContainText(/沙耶|Saya/);
});

test('a guest counts fewer works than a member', async ({ request, page, member }) => {
  void member;
  // `request` carries no cookie; the page's own does, the fixture's session.
  const asGuest = await (await request.get('/vndbserve/vn?fields=id&limit=1')).json();
  const asMember = await (await page.request.get('/vndbserve/vn?fields=id&limit=1')).json();
  expect(asGuest.count).toBeGreaterThan(0);
  expect(asGuest.count).toBeLessThan(asMember.count);
});

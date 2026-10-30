import { expect, test } from './fixtures';

test('anyone can read the whole database counted, from the header', async ({ page }) => {
  await page.goto('/');
  await page
    .getByRole('navigation', { name: 'Browse' })
    .getByRole('link', { name: 'Stats' })
    .click();
  await expect(page).toHaveURL(/\/stats$/);
  await expect(page.getByRole('link', { name: 'Stats' })).toHaveAttribute('aria-current', 'page');

  // Each total leads to the list it counts.
  const novels = page.getByRole('main').locator('a[href="/v"]');
  await expect(novels).toHaveText(/^[1-9][\d,]*\s*Visual novels$/);

  // The rankings are links to what they rank, and a heading is its name
  // alone, not the controls beside it.
  const developers = page.locator('section:not([data-group])', {
    has: page.getByRole('heading', { name: 'Developers', exact: true }),
  });
  await expect(developers.getByRole('link').first()).toHaveAttribute('href', /^\/p\d+$/);

  // One choice of sex follows every character chart: female heights differ
  // from everyone's.
  const height = page.locator('section:not([data-group])', {
    has: page.getByRole('heading', { name: 'Height', exact: true }),
  });
  const note = height.getByText(/^Median \d+ cm/);
  const everyone = await note.textContent();
  await page
    .getByRole('radiogroup', { name: 'Characters of' })
    .getByRole('radio', { name: 'Female' })
    .click();
  await expect(note).not.toHaveText(everyone!);
  await expect(note).toContainText('female characters');

  // The group row jumps to a group.
  await page
    .getByRole('navigation', { name: 'Sections' })
    .getByRole('link', { name: 'Staff' })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Staff', level: 2, exact: true }),
  ).toBeInViewport();
});

test('the counts are a public route of the read API', async ({ request }) => {
  const res = await request.get('/vndbserve/stats');
  expect(res.status()).toBe(200);
  const { stats } = (await res.json()) as { stats: { totals: { key: string; count: number }[] } };
  expect(stats.totals.find(t => t.key === 'v')?.count).toBeGreaterThan(0);
});

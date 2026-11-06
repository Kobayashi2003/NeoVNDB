import { expect, test } from '@playwright/test';

test("a voice actor's page opens on the works they voiced in", async ({ page }) => {
  // Maeda Konomi has no other credits, so there is no Credited on tab.
  await page.goto('/s1491');
  const tabs = page.getByRole('tab');
  await expect(tabs).toHaveText([/^Voiced in/, /^Voiced characters/]);
  await expect(page.locator('[data-results] a[href^="/v"]').first()).toBeVisible();
  await tabs.filter({ hasText: /^Voiced characters/ }).click();
  await expect(page.locator("[data-results] a[href='/c521']")).toBeVisible();
});

test("credits and voice work are both on a person's page", async ({ page }) => {
  // Tomonaga Akane sang for a few works and voiced in hundreds: the voice
  // work comes first, the credits after it.
  await page.goto('/s83');
  const tabs = page.getByRole('tab');
  await expect(tabs).toHaveText([/^Voiced in\s*[\d,]+/, /^Voiced characters/, /^Credited on/]);
  const works = Number((await tabs.first().textContent())!.replace(/\D/g, ''));
  const credited = Number((await tabs.last().textContent())!.replace(/\D/g, ''));
  expect(works).toBeGreaterThan(credited);
});

// A trait can itself be a spoiler for a character: Death is one for most who
// carry it. At the default spoiler level they are left off its list.
test("a trait's page leaves out those for whom it is a spoiler", async ({ page, request }) => {
  const count = async (q: string) =>
    (
      (await (await request.get(`/vndbserve/character?fields=id&limit=1&${q}`)).json()) as {
        count: number;
      }
    ).count;
  const capped = await count('trait=i415:0');
  const all = await count('trait=i415');
  expect(capped).toBeLessThan(all);

  await page.goto('/i415');
  // A tab, or the label one tab alone is drawn as.
  const first = page.locator('a, span', { hasText: /^Including child traits\s*[\d,]+$/ }).first();
  const shown = Number((await first.textContent())!.replace(/\D/g, ''));
  expect(shown).toBe(capped);
});

test("a producer's tabs leave out the empty and the redundant", async ({ page }) => {
  // Sekai Project only publishes: no Developed, and "Developed or published"
  // would be the Published list again.
  await page.goto('/p162');
  const tabs = page.getByRole('tab');
  await expect(tabs.filter({ hasText: /^Published/ })).toHaveCount(1);
  await expect(tabs.filter({ hasText: /^Developed/ })).toHaveCount(0);
  await expect(tabs.filter({ hasText: /^Releases/ })).toHaveCount(1);
});

test("the characters view's spoiler switch closes what was opened by hand", async ({ page }) => {
  await page.goto('/v17');
  await page
    .getByRole('button', { name: /^Characters/ })
    .first()
    .click();
  const main = page.locator('main');
  const toggle = main
    .getByRole('button', { name: /Show minor spoilers|Show major spoilers|Hide spoilers/ })
    .first();
  const hidden = main.getByRole('button', { name: 'Show spoiler' });

  const before = await hidden.count();
  expect(before).toBeGreaterThan(0);
  await hidden.first().click();
  await expect(hidden).toHaveCount(before - 1);
  await toggle.click();
  await expect(hidden).toHaveCount(before);
});

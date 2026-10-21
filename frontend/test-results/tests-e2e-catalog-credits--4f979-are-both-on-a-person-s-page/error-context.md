# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: tests\e2e\catalog.spec.ts >> credits and voice work are both on a person's page
- Location: tests\e2e\catalog.spec.ts:13:5

# Error details

```
Error: page.goto: Protocol error (Page.navigate): Cannot navigate to invalid URL
Call log:
  - navigating to "/s83", waiting until "load"

```

# Test source

```ts
  1  | import { expect, test } from '@playwright/test';
  2  | 
  3  | test("a voice actor's page opens on the works they voiced in", async ({ page }) => {
  4  |   // Maeda Konomi has no other credits, so there is no Credited on tab.
  5  |   await page.goto('/s1491');
  6  |   const tabs = page.getByRole('tab');
  7  |   await expect(tabs).toHaveText([/^Voiced in/, /^Voiced characters/]);
  8  |   await expect(page.locator('[data-results] a[href^="/v"]').first()).toBeVisible();
  9  |   await tabs.filter({ hasText: /^Voiced characters/ }).click();
  10 |   await expect(page.locator("[data-results] a[href='/c521']")).toBeVisible();
  11 | });
  12 | 
  13 | test("credits and voice work are both on a person's page", async ({ page }) => {
  14 |   // Tomonaga Akane sang for a few works and voiced in hundreds: the voice
  15 |   // work comes first, the credits after it.
> 16 |   await page.goto('/s83');
     |              ^ Error: page.goto: Protocol error (Page.navigate): Cannot navigate to invalid URL
  17 |   const tabs = page.getByRole('tab');
  18 |   await expect(tabs).toHaveText([/^Voiced in\s*[\d,]+/, /^Voiced characters/, /^Credited on/]);
  19 |   const works = Number((await tabs.first().textContent())!.replace(/\D/g, ''));
  20 |   const credited = Number((await tabs.last().textContent())!.replace(/\D/g, ''));
  21 |   expect(works).toBeGreaterThan(credited);
  22 | });
  23 | 
  24 | test("a producer's tabs leave out the empty and the redundant", async ({ page }) => {
  25 |   // Sekai Project only publishes: no Developed, and "Developed or published"
  26 |   // would be the Published list again.
  27 |   await page.goto('/p162');
  28 |   const tabs = page.getByRole('tab');
  29 |   await expect(tabs.filter({ hasText: /^Published/ })).toHaveCount(1);
  30 |   await expect(tabs.filter({ hasText: /^Developed/ })).toHaveCount(0);
  31 |   await expect(tabs.filter({ hasText: /^Releases/ })).toHaveCount(1);
  32 | });
  33 | 
  34 | test("the characters view's spoiler switch closes what was opened by hand", async ({ page }) => {
  35 |   await page.goto('/v17');
  36 |   await page
  37 |     .getByRole('button', { name: /^Characters/ })
  38 |     .first()
  39 |     .click();
  40 |   const main = page.locator('main');
  41 |   const toggle = main
  42 |     .getByRole('button', { name: /Show minor spoilers|Show major spoilers|Hide spoilers/ })
  43 |     .first();
  44 |   const hidden = main.getByRole('button', { name: 'Show spoiler' });
  45 | 
  46 |   const before = await hidden.count();
  47 |   expect(before).toBeGreaterThan(0);
  48 |   await hidden.first().click();
  49 |   await expect(hidden).toHaveCount(before - 1);
  50 |   await toggle.click();
  51 |   await expect(hidden).toHaveCount(before);
  52 | });
  53 | 
```
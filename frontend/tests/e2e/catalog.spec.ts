import { expect, test } from "@playwright/test"

test("a voice actor's page lists the characters they voiced", async ({ page }) => {
  // Maeda Konomi has no other credits, so hers is the only tab, shown as a label.
  await page.goto("/s1491")
  await expect(page.locator("main").getByText("Voiced characters")).toBeVisible()
  await expect(page.locator("[data-results] a[href='/c521']")).toBeVisible()
  await expect(page.getByRole("tab", { name: /Credited on/ })).toHaveCount(0)
})

test("a producer's tabs leave out the empty and the redundant", async ({ page }) => {
  // Sekai Project only publishes: no Developed, and "Developed or published"
  // would be the Published list again.
  await page.goto("/p162")
  const tabs = page.getByRole("tab")
  await expect(tabs.filter({ hasText: /^Published/ })).toHaveCount(1)
  await expect(tabs.filter({ hasText: /^Developed/ })).toHaveCount(0)
  await expect(tabs.filter({ hasText: /^Releases/ })).toHaveCount(1)
})

test("the characters view's spoiler switch closes what was opened by hand", async ({ page }) => {
  await page.goto("/v17")
  await page.getByRole("button", { name: /^Characters/ }).first().click()
  const main = page.locator("main")
  const toggle = main.getByRole("button", { name: /Show minor spoilers|Show major spoilers|Hide spoilers/ }).first()
  const hidden = main.getByRole("button", { name: "Show spoiler" })

  const before = await hidden.count()
  expect(before).toBeGreaterThan(0)
  await hidden.first().click()
  await expect(hidden).toHaveCount(before - 1)
  await toggle.click()
  await expect(hidden).toHaveCount(before)
})

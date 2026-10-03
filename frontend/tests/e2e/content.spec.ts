import { expect, test } from "@playwright/test"

test("descriptions render their markup", async ({ page }) => {
  // v2002's description opens with a [b] line; [b] once never matched at all.
  await page.goto("/v2002")
  await expect(page.locator("span.font-semibold", { hasText: "Decide The Fate" }).first()).toBeVisible()
})

test("every page names its icon", async ({ page }) => {
  await page.goto("/v")
  const href = await page.locator('link[rel="icon"]').first().getAttribute("href")
  expect(href).toBeTruthy()
  expect((await page.request.get(href!)).ok()).toBe(true)
})

test("a visual novel lists works alike in their tags, its own relations left out", async ({ page }) => {
  await page.goto("/v17")
  const section = page.locator("section", { has: page.getByRole("heading", { name: /Similar/ }) })
  const cards = section.locator("a[href^='/v']")
  await expect(cards).toHaveCount(20)
  // Never7 is related to Ever17, so it belongs to the sidebar, not here.
  await expect(section.locator("a[href='/v248']")).toHaveCount(0)
  await expect(section.locator("a[href='/v17']")).toHaveCount(0)
})

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

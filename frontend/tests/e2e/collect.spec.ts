import { expect, test } from "./fixtures"

test("results are saved to a new list from the list page", async ({ page, user }) => {
  await page.goto("/v?sort=votecount&reverse=true")
  await page.locator("button[data-select]:visible").click()
  const cards = page.locator("main button[aria-pressed]:not([data-select])")
  for (let i = 0; i < 3; i++) await cards.nth(i).click()
  await expect(page.getByText("3 selected")).toBeVisible()

  await page.getByRole("button", { name: /Save to/ }).click()
  await page.getByRole("button", { name: "New list" }).click()
  await page.getByLabel("New list name").fill("From e2e")
  await page.getByLabel("New list name").press("Enter")
  await expect(page.getByRole("status")).toHaveText(/Saved 3 to “From e2e”/)
  await expect(page.getByText("0 selected")).toBeVisible()

  const lists = (await (await user.call("GET", "/collections?type=v")).json()) as {
    results: { name: string; count: number }[]
  }
  expect(lists.results.find((l) => l.name === "From e2e")?.count).toBe(3)
})

test("only one set of search results selects at a time", async ({ page, user }) => {
  void user
  await page.goto("/q?q=key")
  const toggles = page.locator("button[data-select]:visible")
  await toggles.nth(0).click()
  await toggles.nth(1).click()
  await expect(page.locator("button[data-select][aria-pressed=true]")).toHaveCount(1)
  await expect(page.getByText(/\d+ selected/)).toHaveCount(1)
})

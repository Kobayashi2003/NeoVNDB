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

test("an entry vndb no longer has stays visible and removable", async ({ page, user }) => {
  const list = (await (await user.call("POST", "/collections", { type: "v", name: "Gone" })).json()) as {
    id: number
  }
  // v17 is real; no vndb id comes near v9999999.
  await user.call("POST", `/collections/${list.id}/marks/add`, { items: ["v17", "v9999999"] })

  await page.goto(`/u/${list.id}?sort=title`)
  await expect(page.getByText(/One entry on this list is no longer on vndb/)).toBeVisible()
  await page.getByRole("link", { name: "See it in added order" }).click()

  const gone = page.getByText("v9999999", { exact: true })
  await expect(gone).toBeVisible()
  await expect(page.getByText("No longer on vndb")).toBeVisible()

  await page.getByRole("button", { name: "Select" }).click()
  // The checkbox is drawn over the card, beside it in the DOM rather than around it.
  await gone.locator("xpath=ancestor::div[button[@aria-pressed]][1]/button").click()
  await page.getByTitle("Remove from this list").click()
  await page.getByRole("button", { name: "Yes, remove them" }).click()
  await expect(gone).toHaveCount(0)

  const left = (await (await user.call("GET", `/collections/${list.id}/items`)).json()) as { items: string[] }
  expect(left.items).toEqual(["v17"])
})

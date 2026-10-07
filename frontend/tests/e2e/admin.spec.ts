import { expect, test } from "./fixtures"

test("the services' admin routes are closed to anyone not signed in", async ({ request }) => {
  for (const path of ["/vndbserve/admin/status", "/imgserve/admin/status", "/userserve/admin/users"]) {
    expect((await request.get(path)).status(), path).toBe(401)
  }
  expect((await request.post("/vndbserve/admin/update")).status()).toBe(401)
})

test("a reader who is not an administrator is turned away", async ({ page, user }) => {
  await page.goto("/admin")
  await expect(page.getByText("Administrators only.")).toBeVisible()
  // What the edge asks before letting anyone through to the other services.
  expect((await user.call("GET", "/auth/admin")).status).toBe(403)
  expect((await user.call("GET", "/admin/users")).status).toBe(403)
})

test("an administrator sees the mirror, the translations and the accounts", async ({ page, admin }) => {
  await page.goto("/")
  await page.getByRole("button", { name: admin.name }).click()
  await page.getByRole("link", { name: "Administration" }).click()
  await expect(page).toHaveURL(/\/admin$/)

  // Mirror: the live generation and every scheduled job's card.
  await expect(page.getByRole("cell", { name: "vndb", exact: true })).toBeVisible()
  for (const card of ["Update", "Images", "User database backups"]) {
    await expect(page.getByRole("heading", { name: card })).toBeVisible()
  }

  // Translations: tags with their names, filtered to what is missing.
  await page.getByRole("tab", { name: "Translations" }).click()
  await expect(page.getByText(/\d[\d,]* tags: /)).toBeVisible()
  await page.getByLabel("Untranslated only").uncheck()
  await expect(page.getByLabel("Name translation").first()).toBeVisible()

  // A description that loses its markup is refused, and nothing is stored.
  const refused = await page.request.put("http://127.0.0.1:17031/admin/trans", {
    data: { category: "trait", id: 1162, field: "description", target: "リンクを落とした訳" },
  })
  expect(refused.status()).toBe(400)

  // Accounts: this one, marked as the reader's own.
  await page.getByRole("tab", { name: "Users" }).click()
  const row = page.getByRole("row", { name: new RegExp(admin.name) })
  await expect(row.getByText("you")).toBeVisible()
})

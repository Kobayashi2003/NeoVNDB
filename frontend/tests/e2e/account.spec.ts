import { expect, test } from './fixtures';

test('deleting an account asks first and signs out', async ({ page, user }) => {
  await page.goto('/account');
  await expect(page.locator('h1')).toHaveText(user.name);

  await page.getByRole('button', { name: 'Delete account…' }).click();
  await expect(page.getByText('This cannot be undone.')).toBeVisible();
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByRole('button', { name: 'Delete account…' })).toBeVisible();

  // A wrong password is refused; the real delete goes through the API so no
  // password is typed into the page.
  expect((await user.call('POST', '/me/delete', { password: 'wrong' })).status).toBe(403);
  expect((await user.call('POST', '/me/delete', { password: user.password })).status).toBe(204);

  await page.reload();
  await expect(page.getByText('This page is about your account, so it needs one.')).toBeVisible();
});

import { expect, test } from '@playwright/test';

/**
 * The fixture is also the demo. Its front page lists the textbook cases only; the chat with a seeded bug is still a
 * page of its own for the tests and for a link to it, and still says what is on and the way back.
 */
test('the front page lists the textbook cases, and the bug pages stay reachable', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.card[data-basic]').first()).toBeVisible();
  expect(await page.locator('.card[data-basic]').count()).toBeGreaterThan(5);
  await expect(page.locator('.card[data-bug]')).toHaveCount(0);

  // The sandbox: the chat with no bug on, to play with.
  await page.getByTestId('sandbox').click();
  await expect(page.getByTestId('unread')).toBeVisible();
  await expect(page.getByTestId('strip')).toContainText('sandbox');
  await page.getByTestId('strip').getByRole('link').click();
  await expect(page.getByTestId('sandbox')).toBeVisible();

  await page.goto('/bug/hidden-hook-state');
  await expect(page.getByTestId('unread')).toBeVisible();
  // The strip says which bug is on and what to do about it.
  await expect(page.getByTestId('strip')).toContainText('hidden-hook-state');
  await expect(page.getByTestId('strip')).toContainText('just wait');

  await page.getByTestId('strip').getByRole('link').click();
  await expect(page.locator('.card[data-basic]').first()).toBeVisible();
  await expect(page.getByTestId('strip')).toHaveCount(0);
});

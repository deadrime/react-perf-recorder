import { expect, test } from '@playwright/test';

/** The fixture is also the demo: the cards on `/` are how a person meets the tool, so they are tested too. */
test('the demo cards lead into the app with one bug on, and back', async ({ page }) => {
  await page.goto('/');
  const cards = page.locator('.card[data-bug]');
  const links = await cards.evaluateAll((els) => els.map((el) => [(el as HTMLElement).dataset.bug, el.getAttribute('href')]));
  expect(links.length).toBeGreaterThan(10);
  // Every card is the page of its own bug.
  expect(links.every(([id, href]) => href === `/bug/${id}`)).toBe(true);

  await page.locator('.card[data-bug="hidden-hook-state"]').click();
  await expect(page.getByTestId('unread')).toBeVisible();
  // The strip says which bug is on and what to do about it.
  await expect(page.getByTestId('strip')).toContainText('hidden-hook-state');
  await expect(page.getByTestId('strip')).toContainText('just wait');

  await page.getByTestId('strip').getByRole('link').click();
  await expect(cards.first()).toBeVisible();
  await expect(page.getByTestId('strip')).toHaveCount(0);
});

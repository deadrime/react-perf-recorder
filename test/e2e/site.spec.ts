import { expect, test } from '@playwright/test';

test('the front page says what the tool is and leads to the docs, which are the repository markdown', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('hero')).toContainText('npm i -D -E react-perf-recorder');
  await page.getByTestId('hero').getByRole('link', { name: 'Docs' }).click();
  const docs = page.getByTestId('docs');
  await expect(docs.locator('article h1')).toHaveText('react-perf-recorder');
  // A link between the markdown files is a page of the site, not the file on GitHub.
  await docs.locator('article a', { hasText: 'Measuring a fix' }).click();
  await expect(page).toHaveURL(/\/docs\/measuring-a-fix$/);
  await expect(docs.locator('article h1')).toHaveText('Measuring a fix');
  await expect(docs.locator('nav a[aria-current="page"]')).toHaveText('Measuring a fix');
});

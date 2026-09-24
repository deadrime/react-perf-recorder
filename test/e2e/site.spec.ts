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

test('the front page and the docs keep the panel away; a page with something to record has it', async ({ page }) => {
  // Asked for by the URL, which also remembers it: the pages with nothing to record still leave it out.
  await page.goto('/?rpr=panel');
  await expect(page.getByTestId('hero')).toBeVisible();
  await expect(page.locator('[data-rpr="record"]')).toBeHidden();
  await page.keyboard.press('Alt+Shift+KeyR');
  expect(await page.evaluate(() => (window as any).__REACT_PERF_RECORDER__.engine.recording)).toBe(false);
  await page.goto('/docs');
  await expect(page.getByTestId('docs')).toBeVisible();
  await expect(page.locator('[data-rpr="record"]')).toBeHidden();
  // Nothing of it was remembered: the next page shows the panel.
  await page.goto('/basics/state');
  await expect(page.locator('[data-rpr="record"]')).toBeVisible();
});

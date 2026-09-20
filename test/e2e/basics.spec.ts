import { expect, test, type Page } from '@playwright/test';

/** The basics pages claim a difference between two versions of one widget; these check the claim is true. */
const countsOf = (page: Page, side: 'broken' | 'fixed') =>
  page.locator(`[data-case="${side}"] .count`).evaluateAll((els) => els.map((el) => Number((el as HTMLElement).dataset.count)));

test('memo only skips a child when the handler it gets stays the same', async ({ page }) => {
  await page.goto('/basics/memo');
  await expect(page.getByTestId('render')).toBeVisible();
  for (let i = 0; i < 4; i++) await page.getByTestId('render').click();

  // The handler written in render is a new prop every time, so memo lets every row through.
  expect(await countsOf(page, 'broken')).toEqual([5, 5, 5]);
  // The one from useCallback is the same prop, so the rows never render again.
  expect(await countsOf(page, 'fixed')).toEqual([1, 1, 1]);
});

test('key decides whether a row is the same row after one is added at the top', async ({ page }) => {
  await page.goto('/basics/keys');
  const rows = (mode: string) =>
    page.locator(`[data-testid="list-${mode}"] li`).evaluateAll((els) =>
      els.map((li) => ({
        title: li.querySelector('.grow')!.textContent,
        checked: li.querySelector('input')!.checked,
        renders: Number((li.querySelector('.count') as HTMLElement).dataset.count),
      }))
    );
  // The first task is ticked in both lists, then a new one arrives above it.
  await page.locator('[data-testid="list-index"] input').first().check();
  await page.locator('[data-testid="list-id"] input').first().check();
  await page.getByTestId('prepend').click();

  // Matched by position: the tick stayed on the top row, which is now someone else. The three rows that already
  // existed re-rendered with the next task's data, and the extra position at the end is the only mount.
  const byIndex = await rows('index');
  expect(byIndex[0]).toMatchObject({ title: 'New task 1', checked: true });
  expect(byIndex.slice(0, 3).every((r) => r.renders > 1)).toBe(true);
  expect(byIndex[3]).toMatchObject({ renders: 1 });

  // Matched by id: the tick stayed on its task, the new row mounted and nothing else rendered.
  const byId = await rows('id');
  expect(byId[0]).toMatchObject({ title: 'New task 1', checked: false, renders: 1 });
  expect(byId[1]).toMatchObject({ title: 'Write the release notes', checked: true });
  expect(byId.slice(2).every((r) => r.renders === 1)).toBe(true);

  // A key nobody can match: every row is a new row, so the counters start over and the ticks are gone.
  expect((await rows('random')).every((r) => r.renders === 1 && !r.checked)).toBe(true);
});

test('the front page leads to the basics and back', async ({ page }) => {
  await page.goto('/');
  await page.locator('.card[data-basic="keys"]').click();
  await expect(page.getByTestId('list-id')).toBeVisible();
  await expect(page.getByTestId('strip')).toContainText('key');
  await page.getByTestId('strip').getByRole('link').click();
  await expect(page.locator('.card[data-basic="memo"]')).toBeVisible();
});

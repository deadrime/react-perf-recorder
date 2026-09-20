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

  await page.getByTestId('reset').click();
  expect(await countsOf(page, 'broken')).toEqual([1, 1, 1]);
});

test('key decides whether a row is the same row after one is added at the top', async ({ page }) => {
  await page.goto('/basics/keys');
  const rows = (mode: string) =>
    page.locator(`[data-testid="list-${mode}"] li`).evaluateAll((els) =>
      els.map((li) => ({
        title: li.querySelector('.grow')!.textContent,
        checked: li.querySelector('input')!.checked,
        renders: Number((li.querySelector('[data-count]') as HTMLElement).dataset.count),
        mounts: Number((li.querySelector('[data-mounts]') as HTMLElement).dataset.mounts),
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

  // With index keys the task pushed to the end lands on a position that did not exist, so it is mounted a second
  // time; with id keys every task is still on the row it was mounted on.
  expect(byIndex.some((r) => r.mounts > 1)).toBe(true);
  expect(byId.every((r) => r.mounts === 1)).toBe(true);

  // A key nobody can match: every row is a new row. Its render counter says 1, and only the mounts counter tells
  // the difference between a row that was skipped and a row that was thrown away.
  const byRandom = await rows('random');
  expect(byRandom.every((r) => r.renders === 1 && !r.checked)).toBe(true);
  expect(byRandom.filter((r) => r.title !== 'New task 1').every((r) => r.mounts > 1)).toBe(true);

  // Starting over mounts the lists again: the tasks, the ticks and the counters are all back where they began.
  await page.getByTestId('reset').click();
  const back = await rows('id');
  expect(back).toHaveLength(3);
  expect(back.every((r) => r.renders === 1 && r.mounts === 1 && !r.checked)).toBe(true);
});

test('the front page leads to the basics and back', async ({ page }) => {
  await page.goto('/');
  await page.locator('.card[data-basic="keys"]').click();
  await expect(page.getByTestId('list-id')).toBeVisible();
  await expect(page.getByTestId('strip')).toContainText('key');
  await page.getByTestId('strip').getByRole('link').click();
  await expect(page.locator('.card[data-basic="memo"]')).toBeVisible();
});

test('an object written in render is a new prop every time', async ({ page }) => {
  await page.goto('/basics/props');
  for (let i = 0; i < 3; i++) await page.getByTestId('render').click();
  // The panel rendered four times; on the left the cards came along, on the right they did not.
  expect(await countsOf(page, 'broken')).toEqual([4, 4, 4]);
  expect(await countsOf(page, 'fixed')).toEqual([1, 1, 1]);

  // When the tag really changes, both sides render — that is the render nobody argues with.
  await page.getByTestId('filter').click();
  expect(await countsOf(page, 'fixed')).toEqual([2, 2, 2]);
});

test('a clock in its own component leaves the card alone', async ({ page }) => {
  await page.goto('/basics/state');
  const clocks = async () => ({
    broken: await countsOf(page, 'broken'),
    fixed: await countsOf(page, 'fixed'),
  });
  const before = await clocks();
  await page.waitForTimeout(2200);
  const after = await clocks();
  // Left: the card and every item render with the clock. Right: only the clock does.
  expect(after.broken.every((n, i) => n > before.broken[i])).toBe(true);
  expect(after.fixed.slice(1).every((n, i) => n === before.fixed[i + 1])).toBe(true);
  expect(after.fixed[0]).toBeGreaterThan(before.fixed[0]);
});

test('two values in one context wake up both readers', async ({ page }) => {
  await page.goto('/basics/context');
  await page.getByTestId('theme').click();
  // Left: the reader of the user renders although the user did not change. Right: only the theme reader.
  expect(await countsOf(page, 'broken')).toEqual([2, 2]);
  expect(await countsOf(page, 'fixed')).toEqual([1, 2]);
});

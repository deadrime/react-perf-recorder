import { expect, test, type Page } from '@playwright/test';

/** The harder cases claim a difference too; these check it, by the counters and — where it is renders — the outlines. */
const countsOf = (page: Page, side: 'broken' | 'fixed') =>
  page.locator(`[data-case="${side}"] [data-count]`).evaluateAll((els) => els.map((el) => Number((el as HTMLElement).dataset.count)));

type Flash = { side: string };
const watchFlashes = (page: Page) =>
  page.evaluate(() => {
    const w = window as unknown as { __REACT_PERF_RECORDER__: { panel: { highlighter: any } }; __flashes: Flash[] };
    const highlighter = w.__REACT_PERF_RECORDER__.panel.highlighter;
    w.__flashes = [];
    const flash = highlighter.flash.bind(highlighter);
    highlighter.flash = (pairs: Array<[Element, string, unknown]>, ...rest: unknown[]) => {
      for (const [el] of pairs) w.__flashes.push({ side: (el.closest('[data-case]') as HTMLElement | null)?.dataset.case ?? 'outside' });
      return flash(pairs, ...rest);
    };
  });
const outlines = async (page: Page) => {
  const all = await page.evaluate(() => (window as unknown as { __flashes: Flash[] }).__flashes);
  return { broken: all.filter((f) => f.side === 'broken').length, fixed: all.filter((f) => f.side === 'fixed').length };
};
const open = async (page: Page, id: string) => {
  await page.goto(`/advanced/${id}?rpr=panel`);
  await expect.poll(() => page.evaluate(() => Boolean((window as any).__REACT_PERF_RECORDER__?.engine.idleHighlighting))).toBe(true);
  await watchFlashes(page);
};

test('the front page lists the harder cases apart from the textbook ones', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('[data-testid="advanced"] [data-advanced]')).toHaveCount(4);
  await page.locator('[data-advanced="chain"]').click();
  await expect(page.getByTestId('strip')).toContainText('a chain of effects');
});

test('a chain of effects renders four times for one click; worked out in render, once', async ({ page }) => {
  await open(page, 'chain');
  const before = { broken: await countsOf(page, 'broken'), fixed: await countsOf(page, 'fixed') };
  await page.getByTestId('country-Japan').click();
  await expect(page.locator('[data-case="broken"]')).toContainText('Tokyo');
  const after = { broken: await countsOf(page, 'broken'), fixed: await countsOf(page, 'fixed') };
  expect(after.broken.map((n, i) => n - before.broken[i])).toEqual([4, 4, 4]);
  expect(after.fixed.map((n, i) => n - before.fixed[i])).toEqual([1, 1, 1]);
  const lit = await outlines(page);
  expect(lit.broken).toBeGreaterThan(lit.fixed);
});

test('a width kept in state renders on every frame of a resize; the number that fits, a few times', async ({ page }) => {
  await open(page, 'measure');
  const rowRenders = () => page.locator('.measured p [data-count]').evaluateAll((els) => els.map((el) => Number((el as HTMLElement).dataset.count)));
  const [broken0, fixed0] = await rowRenders();
  await page.getByTestId('resize').click();
  await page.waitForTimeout(1500);
  const [broken1, fixed1] = await rowRenders();
  // A frame each on the left; on the right a render each time a tag comes or goes, on the way in and out.
  expect(broken1 - broken0).toBeGreaterThan(30);
  expect(fixed1 - fixed0).toBeGreaterThan(0);
  expect((fixed1 - fixed0) * 3).toBeLessThan(broken1 - broken0);
  const lit = await outlines(page);
  expect(lit.broken).toBeGreaterThan(lit.fixed * 2);
});

test('a deferred list ends where the synchronous one does', async ({ page }) => {
  await page.goto('/advanced/deferred');
  await page.getByTestId('search-sync').pressSequentially('lima', { delay: 30 });
  await page.getByTestId('search-deferred').pressSequentially('lima', { delay: 30 });
  const found = (side: string) => page.getByTestId(`found-${side}`).getAttribute('data-found');
  await expect.poll(() => found('deferred')).toBe(await found('sync'));
  expect(Number(await found('sync'))).toBeGreaterThan(0);
});

test('a query spread whole renders on every poll; read for its data, it does not', async ({ page }) => {
  await open(page, 'query');
  await expect(page.locator('[data-case="fixed"] li')).toHaveCount(3);
  const before = { broken: await countsOf(page, 'broken'), fixed: await countsOf(page, 'fixed') };
  await page.waitForTimeout(2200);
  const after = { broken: await countsOf(page, 'broken'), fixed: await countsOf(page, 'fixed') };
  // Three polls: isFetching moves on each of them on the left; nothing it reads changes on the right.
  expect(after.broken.every((n, i) => n - before.broken[i] >= 2)).toBe(true);
  expect(after.fixed).toEqual(before.fixed);
  const lit = await outlines(page);
  expect(lit.broken).toBeGreaterThan(lit.fixed);
});

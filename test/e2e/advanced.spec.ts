import { expect, test, type Page } from '@playwright/test';
import type { RecordingV2 } from '../../src/shared/schema';

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
  await expect(page.locator('[data-testid="advanced"] [data-advanced]')).toHaveCount(12);
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

test('an empty default renders every row for a click on one; a shared one, the two that changed', async ({ page }) => {
  await open(page, 'empty');
  const before = { broken: await countsOf(page, 'broken'), fixed: await countsOf(page, 'fixed') };
  await page.getByTestId('select-next').click();
  await page.getByTestId('select-next').click();
  const after = { broken: await countsOf(page, 'broken'), fixed: await countsOf(page, 'fixed') };
  const grew = (side: 'broken' | 'fixed') => after[side].filter((n, i) => n > before[side][i]).length;
  // All but the two rows with marks: theirs is the same array from the map every time.
  expect(grew('broken')).toBe(before.broken.length - 2);
  // Rows 0, 1 and 2 changed their selection; no other row renders.
  expect(grew('fixed')).toBe(3);
});

test('a whole copy of the form renders every group for a letter; a copy of the path, the one typed into', async ({ page }) => {
  await open(page, 'copy');
  const before = { broken: await countsOf(page, 'broken'), fixed: await countsOf(page, 'fixed') };
  await page.getByTestId('broken-contact-name').pressSequentially('bc', { delay: 30 });
  await page.getByTestId('fixed-contact-name').pressSequentially('bc', { delay: 30 });
  const after = { broken: await countsOf(page, 'broken'), fixed: await countsOf(page, 'fixed') };
  expect(after.broken.map((n, i) => n - before.broken[i])).toEqual([2, 2, 2, 2]);
  expect(after.fixed.map((n, i) => n - before.fixed[i])).toEqual([2, 0, 0, 0]);
});

test("memo cards render through a package's context when its items are a new array; not when they keep it", async ({ page }) => {
  await open(page, 'context');
  const before = { broken: await countsOf(page, 'broken'), fixed: await countsOf(page, 'fixed') };
  await page.getByTestId('note-broken').pressSequentially('abc', { delay: 30 });
  await page.getByTestId('note-fixed').pressSequentially('abc', { delay: 30 });
  const after = { broken: await countsOf(page, 'broken'), fixed: await countsOf(page, 'fixed') };
  expect(after.broken.every((n, i) => n - before.broken[i] === 3)).toBe(true);
  expect(after.fixed).toEqual(before.fixed);
});

test('a selector of the whole list renders every card for a star; a selector of the card, the one starred', async ({ page }) => {
  await open(page, 'redux');
  const before = { broken: await countsOf(page, 'broken'), fixed: await countsOf(page, 'fixed') };
  // The button stars the same card in both sides' stores: twice, two cards.
  await page.getByTestId('star-next').click();
  await page.getByTestId('star-next').click();
  const after = { broken: await countsOf(page, 'broken'), fixed: await countsOf(page, 'fixed') };
  expect(after.broken.map((n, i) => n - before.broken[i])).toEqual(before.broken.map(() => 2));
  const grew = after.fixed.map((n, i) => n - before.fixed[i]);
  expect(grew.filter((n) => n > 0)).toEqual([1, 1]);
  // A star on one side is that side's alone.
  const fixedNow = await countsOf(page, 'fixed');
  await page.locator('[data-case="broken"]').getByTestId('like-Onix').click();
  expect(await countsOf(page, 'fixed')).toEqual(fixedNow);
  await expect(page.locator('[data-case="broken"] li.on')).toHaveCount(3);
  await expect(page.locator('[data-case="fixed"] li.on')).toHaveCount(2);
});

test('a log with every line in the DOM holds ten thousand; windowed, the lines that fit, and the rest as it scrolls', async ({ page }) => {
  await page.goto('/advanced/window');
  await expect(page.locator('[data-testid="log-whole"] li')).toHaveCount(10_000);
  const windowed = page.locator('[data-testid="log-window"] li');
  expect(await windowed.count()).toBeLessThan(30);
  await page.getByTestId('log-window').evaluate((el) => (el.scrollTop = el.scrollHeight));
  await expect(page.locator('[data-testid="log-window"] li[data-line="9999"]')).toHaveCount(1);
  expect(await windowed.count()).toBeLessThan(30);
});

test('a tab set straight away shows the spinner in its place; set in a transition, the old tab stays', async ({ page }) => {
  await page.goto('/advanced/suspense');
  const panel = (side: string) => page.getByTestId(`tabs-${side}`).getByTestId('tab-panel');
  await expect(panel('blocking')).toHaveAttribute('data-tab', 'overview');
  await expect(panel('transition')).toHaveAttribute('data-tab', 'overview');

  await page.getByTestId('tab-blocking-activity').click();
  await expect(page.getByTestId('spinner-blocking')).toBeVisible();
  await expect(panel('blocking')).toHaveAttribute('data-tab', 'activity');
  await expect(page.getByTestId('spinner-blocking')).toHaveCount(0);

  await page.getByTestId('tab-transition-activity').click();
  // The old panel stays on the screen while the new one waits for its data.
  await expect(panel('transition')).toHaveAttribute('data-tab', 'overview');
  await expect(page.getByTestId('spinner-transition')).toHaveCount(0);
  await expect(panel('transition')).toHaveAttribute('data-tab', 'activity');
});

test('options from a prop getter all render for a move of the pointer; a memo that compares what they show, two', async ({ page }) => {
  await open(page, 'getters');
  const move = async (side: string) => {
    const before = await countsOf(page, side === 'props' ? 'broken' : 'fixed');
    const options = page.getByTestId(`option-${side}`);
    for (let i = 0; i < 4; i++) await options.nth(i).hover();
    await expect(options.nth(3)).toHaveClass(/on/);
    const after = await countsOf(page, side === 'props' ? 'broken' : 'fixed');
    return after.reduce((sum, n, i) => sum + n - before[i], 0);
  };
  // Four moves: twelve options each on the left; on the right the one lit and the one that goes dark.
  expect(await move('props')).toBe(48);
  expect(await move('compare')).toBe(7);
  const lit = await outlines(page);
  expect(lit.broken).toBeGreaterThan(lit.fixed * 3);
});

test('what a leak leaves behind: classes of the value put into css, listeners of the popover without a cleanup', async ({ page }) => {
  await page.goto('/advanced/leak');
  await page.getByTestId('run').waitFor();
  await page.evaluate(() => (window as any).__REACT_PERF_RECORDER__.engine.start({ source: 'e2e', highlight: false }));
  await page.getByTestId('run').click();
  await expect(page.getByTestId('bar-broken')).toHaveAttribute('class', /./);
  // Stopped as the run ends: expect.poll backs off to a second, and a flat tail that long hides the growth.
  await page.waitForFunction(() => (document.querySelector('[data-testid=bar-fixed]') as HTMLElement | null)?.style.width === '100%');
  // What record_page does before Stop: without a collection, what is still in memory says nothing.
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('HeapProfiler.collectGarbage');
  const rec = (await page.evaluate(() => (window as any).__REACT_PERF_RECORDER__.engine.stop({ collected: true }))) as RecordingV2;
  const growth = rec.growth!;
  // The leaky popover's listener keeps its setter, and the setter the component: all five closed ones stay.
  const retained = growth.retained!;
  expect(retained.collected).toBe(true);
  expect(retained.components.find((c) => c.name === 'LeakyPopover')).toMatchObject({
    unmounted: 5,
    retained: 5,
    site: expect.stringMatching(/Leak\.tsx:\d+$/),
  });
  expect(retained.components.find((c) => c.name === 'TidyPopover')).toMatchObject({ unmounted: 5, retained: 0 });
  expect(retained.retained).toBe(5);
  expect(growth.metrics.cssRules?.growing).toBe(true);
  expect(growth.metrics.listeners?.growing).toBe(true);
  // Five opens of each popover: the leaky one's listeners stay, the tidy one's last is there while it is open.
  const resize = growth.listeners!.filter((l) => l.target === 'window' && l.type === 'resize');
  // Mapped by the dev server to the line of the leaky effect, the tidy one's is gone with it.
  expect(resize).toEqual([
    expect.objectContaining({
      live: 5,
      site: expect.stringMatching(/advanced\/Leak\.tsx:\d+$/),
      code: expect.stringContaining("addEventListener('resize'"),
    }),
  ]);
  // Playwright's own listeners on the window run from evaluated code: not the page's.
  expect(growth.listeners!.every((l) => l.site?.includes('Leak.tsx'))).toBe(true);
  // No babel plugin, no label: the 100 widths of the broken bar are one group, named by the element that has one.
  expect(growth.styles?.[0]).toMatchObject({ component: 'LeakyProgress', rules: 100, classes: 100, varying: [{ prop: 'width' }] });
  // The fixed bar's one class was there before the recording: nothing else was added.
  expect(growth.styles!.reduce((n, g) => n + g.rules, 0)).toBe(100);
});

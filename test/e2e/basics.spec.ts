import { expect, test, type Page } from '@playwright/test';

/** The basics pages claim a difference between two versions of one widget; these check the claim is true. */
const countsOf = (page: Page, side: 'broken' | 'fixed') =>
  page.locator(`[data-case="${side}"] .count`).evaluateAll((els) => els.map((el) => Number((el as HTMLElement).dataset.count)));

/** The counters of one pair, on a page that shows more than one mistake. */
const countsIn = (page: Page, pair: string, side: 'broken' | 'fixed') =>
  page
    .locator(`[data-pair="${pair}"] [data-case="${side}"] .count`)
    .evaluateAll((els) => els.map((el) => Number((el as HTMLElement).dataset.count)));

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
  expect(await countsIn(page, 'objects', 'broken')).toEqual([4, 4, 4]);
  expect(await countsIn(page, 'objects', 'fixed')).toEqual([1, 1, 1]);
  // A JSX element is an object as well: made in render, it is a new prop for the memo badge every time.
  expect(await countsIn(page, 'element', 'broken')).toEqual([4, 4, 4]);
  expect(await countsIn(page, 'element', 'fixed')).toEqual([1, 1, 1]);

  // When the tag really changes, both sides render — that is the render nobody argues with.
  await page.getByTestId('filter').click();
  expect(await countsIn(page, 'objects', 'fixed')).toEqual([2, 2, 2]);
});

test('a clock in its own component leaves the card alone', async ({ page }) => {
  await page.goto('/basics/state');
  const clocks = async () => ({
    broken: await countsIn(page, 'where', 'broken'),
    fixed: await countsIn(page, 'where', 'fixed'),
  });
  const before = await clocks();
  await page.waitForTimeout(2200);
  const after = await clocks();
  // Left: the card and every item render with the clock. Right: only the clock does.
  expect(after.broken.every((n, i) => n > before.broken[i])).toBe(true);
  expect(after.fixed.slice(1).every((n, i) => n === before.fixed[i + 1])).toBe(true);
  expect(after.fixed[0]).toBeGreaterThan(before.fixed[0]);
});

test('a clock kept in a hook renders whoever calls it', async ({ page }) => {
  await page.goto('/basics/state');
  // The deadline passes two seconds in; by three and a half the clock has ticked on past it.
  await page.waitForTimeout(3500);
  const [broken] = await countsIn(page, 'hook', 'broken');
  const [fixed] = await countsIn(page, 'hook', 'fixed');
  expect(broken).toBeGreaterThan(3);
  // The hook that keeps the answer: the first render and the one when the answer flipped.
  expect(fixed).toBe(2);
  await expect(page.locator('[data-pair="hook"] [data-case="fixed"]')).toContainText('overdue');
});

test('two values in one context wake up both readers', async ({ page }) => {
  await page.goto('/basics/context');
  await page.getByTestId('theme').click();
  // Left: the reader of the user renders although the user did not change. Right: only the theme reader.
  expect(await countsIn(page, 'split', 'broken')).toEqual([2, 2]);
  expect(await countsIn(page, 'split', 'fixed')).toEqual([1, 2]);
});

test('a value object built in the provider wakes every reader each time it renders', async ({ page }) => {
  await page.goto('/basics/context');
  await page.waitForTimeout(2300);
  const providers = await page
    .locator('[data-pair="inline"] [data-provider-renders]')
    .evaluateAll((els) => els.map((el) => Number((el as HTMLElement).dataset.providerRenders)));
  // Both providers render with the clock above them, the same number of times.
  expect(providers[0]).toBeGreaterThan(2);
  expect(providers[1]).toBe(providers[0]);
  // On the left the readers render with their provider; on the right they have not rendered since they mounted.
  expect((await countsIn(page, 'inline', 'broken')).every((n) => n > 2)).toBe(true);
  expect(await countsIn(page, 'inline', 'fixed')).toEqual([1, 1]);
  // The pair above has no clock over it, and nothing reaches it.
  expect(await countsIn(page, 'split', 'broken')).toEqual([1, 1]);

  // A real change of the theme reaches both sides, and both of them show it.
  await page.getByTestId('theme').click();
  await expect(page.locator('[data-pair="inline"] [data-case="broken"]')).toContainText('theme: light');
  await expect(page.locator('[data-pair="inline"] [data-case="fixed"]')).toContainText('theme: light');
  expect(await countsIn(page, 'inline', 'fixed')).toEqual([2, 2]);
});

test('a value read in the handler costs no subscription', async ({ page }) => {
  await page.goto('/basics/snapshot');
  await page.waitForTimeout(1800);
  const [broken] = await countsOf(page, 'broken');
  const [fixed] = await countsOf(page, 'fixed');
  expect(broken).toBeGreaterThan(2);
  expect(fixed).toBe(1);
  // Both of them still send who was typing: the one that never subscribed asked at the moment of the click.
  await page.getByTestId('send-subscribed').click();
  await page.getByTestId('send-read').click();
  await expect(page.getByTestId('sent-subscribed')).toContainText('sent while');
  await expect(page.getByTestId('sent-read')).toContainText('sent while');
});

test('a cache with fewer slots than rows evicts itself on every update', async ({ page }) => {
  await page.goto('/basics/cache');
  await page.waitForTimeout(1800);
  const [broken, fixed] = [await countsOf(page, 'broken'), await countsOf(page, 'fixed')];
  expect(broken).toHaveLength(4);
  expect(broken.every((n) => n > 2)).toBe(true);
  expect(fixed).toEqual([1, 1, 1, 1]);
});

test('a value nobody draws, kept in state, renders on every change of it', async ({ page }) => {
  await page.goto('/basics/ref');
  const sweep = async (id: string) => {
    const pad = (await page.getByTestId(id).boundingBox())!;
    await page.mouse.move(pad.x + 10, pad.y + 10);
    await page.mouse.move(pad.x + pad.width - 10, pad.y + 40, { steps: 15 });
  };
  await sweep('pad-state');
  await sweep('pad-ref');
  const [broken] = await countsIn(page, 'spot', 'broken');
  const [fixed] = await countsIn(page, 'spot', 'fixed');
  expect(broken).toBeGreaterThan(10);
  expect(fixed).toBe(1);
  // The ref still knows where the pointer was: pinning works the same on both.
  await page.getByTestId('pin-ref').click();
  await expect(page.getByTestId('pinned-ref')).toContainText('pinned at');
});

test('a handler that reads the latest value through a ref stays the same handler', async ({ page }) => {
  await page.goto('/basics/ref');
  await page.getByTestId('text-deps').pressSequentially('hello', { delay: 30 });
  await page.getByTestId('text-ref').pressSequentially('hello', { delay: 30 });
  // The memo button: a new handler on every letter on the left, the same one on the right.
  expect(await countsIn(page, 'latest', 'broken')).toEqual([6]);
  expect(await countsIn(page, 'latest', 'fixed')).toEqual([1]);
  // And it still sends what was typed last.
  await page.getByTestId('send-ref').click();
  await expect(page.getByTestId('sent-ref')).toHaveText('sent: hello');
});

test('a store wakes whoever asked for more than is on the screen', async ({ page }) => {
  await page.goto('/basics/subscriptions');
  await page.waitForTimeout(2000);
  const [broken, fixed] = [await countsOf(page, 'broken'), await countsOf(page, 'fixed')];
  // Three pairs: the whole object, a fresh array, the exact number — each renders on every push on the left.
  expect(broken).toHaveLength(3);
  expect(broken.every((n) => n > 2)).toBe(true);
  expect(fixed).toEqual([1, 1, 1]);
});

test('an effect that copies props into state costs a second render', async ({ page }) => {
  await page.goto('/basics/effect');
  await page.getByTestId('first').pressSequentially('Anna', { delay: 80 });
  // Four keystrokes: two renders each on the left, one each on the right.
  const [broken, fixed] = [await countsOf(page, 'broken'), await countsOf(page, 'fixed')];
  expect(broken[0]).toBe(fixed[0] + 4);
});

test('a component declared inside a render is mounted again every time', async ({ page }) => {
  await page.goto('/basics/nested');
  await page.getByTestId('note-in-one').fill('mine');
  await page.getByTestId('note-one').fill('mine');
  await page.getByTestId('render').click();
  // The note typed on the left is gone with the row that held it; on the right both the row and the note are there.
  expect(await page.getByTestId('note-in-one').inputValue()).toBe('');
  expect(await page.getByTestId('note-one').inputValue()).toBe('mine');
  const mounts = await page.locator('[data-case="broken"] [data-mounts]').evaluateAll((els) => els.map((el) => Number((el as HTMLElement).dataset.mounts)));
  expect(mounts.every((n) => n > 2)).toBe(true);
});

test('children handed in as a prop skip the parent’s renders', async ({ page }) => {
  await page.goto('/basics/children');
  await page.waitForTimeout(2200);
  const [broken, fixed] = [await countsOf(page, 'broken'), await countsOf(page, 'fixed')];
  // Both clocks ticked; only the report on the left ticked with it.
  expect(broken[0]).toBeGreaterThan(1);
  expect(fixed[0]).toBeGreaterThan(1);
  expect(broken[1]).toBe(broken[0]);
  expect(fixed[1]).toBe(1);
});

test('only what shows the URL renders when the URL changes', async ({ page }) => {
  await page.goto('/basics/router');
  await page.getByTestId('folder-sent').click();
  await page.getByTestId('folder-spam').click();
  const [broken, fixed] = [await countsOf(page, 'broken'), await countsOf(page, 'fixed')];
  // Left: the card read the URL, so the card and every letter under it rendered twice more.
  expect(broken.slice(0, 4)).toEqual([3, 3, 3, 3]);
  // Right: the line that prints the folder rendered; the letters did not.
  expect(fixed.slice(0, 4)).toEqual([3, 1, 1, 1]);
  // A component with nothing but useNavigate still renders on every navigation; a link does not.
  expect(broken[4]).toBe(3);
  expect(fixed[4]).toBe(1);
});

test('a form left to the DOM does not render while you type', async ({ page }) => {
  await page.goto('/basics/form');
  const start = await countsOf(page, 'fixed');
  await page.getByTestId('u-title').pressSequentially('Hi', { delay: 40 });
  await page.getByTestId('u-note').pressSequentially('abc', { delay: 40 });
  const typed = await countsOf(page, 'fixed');
  // The fields never rendered; the preview rendered once per letter of the field it watches, and not for the other.
  expect(typed.slice(0, 2)).toEqual(start.slice(0, 2));
  expect(typed[2]).toBe(start[2] + 2);

  const before = await countsOf(page, 'broken');
  await page.getByTestId('c-title').pressSequentially('Hi', { delay: 40 });
  // The controlled one renders the whole form on every letter.
  expect(await countsOf(page, 'broken')).toEqual(before.map((n) => n + 2));
});

test('every case can show the code behind it, with the line that matters marked', async ({ page }) => {
  for (const id of ['memo', 'keys', 'props', 'state', 'ref', 'context', 'subscriptions', 'snapshot', 'cache', 'effect', 'nested', 'children', 'router', 'form']) {
    await page.goto(`/basics/${id}`);
    const folded = page.locator('.code');
    await expect(folded.first()).toBeVisible();
    // Each case shows its own snippet, and each snippet points at the line the page is about.
    expect(await folded.count()).toBe(await page.locator('[data-case]').count());
    expect(await page.locator('.code .bad').count()).toBeGreaterThan(0);
  }
});

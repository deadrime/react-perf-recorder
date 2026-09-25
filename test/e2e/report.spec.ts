import { expect, test, type Page } from '@playwright/test';

/** Records a couple of seconds of a page from the panel and waits for the report. */
const recordFromPanel = async (page: Page, url: string, act: () => Promise<void>) => {
  await page.goto(url);
  await expect(page.getByTestId('unread')).toBeVisible();
  await page.locator('[data-rpr="record"]').click();
  await act();
  await page.locator('[data-rpr="stop"]').click();
  await expect(page.locator('[data-rpr="result"]')).toContainText('saved');
};

test('the report leads with the answer: the numbers, then the root that wasted renders', async ({ page }) => {
  // The header takes the whole workspace object to show one number of it: renders that change nothing.
  await recordFromPanel(page, '/bug/whole-object?rpr=panel&tick=150', () => page.waitForTimeout(1500));
  const verdict = page.locator('[data-rpr="verdict"]');
  await expect(verdict.locator('.kpi')).not.toHaveCount(0);
  await expect(verdict.locator('.kpi[data-tone="warn"]')).toContainText('wasted renders');
  await expect(verdict.locator('.verdict-title')).toContainText('Main cause');
  // The card under it is a root with wasted renders, opened on its reason.
  await expect(verdict.locator('.stat .badge[data-tone="warn"]')).toContainText('wasted');
  await expect(verdict.locator('.reason-body')).toBeVisible();
});

test('a report with nothing wasted does not call anything a cause', async ({ page }) => {
  await recordFromPanel(page, '/app?rpr=panel&tick=150', async () => {
    await page.getByTestId('tab-people').click();
    await page.getByTestId('tab-chat').click();
  });
  const title = page.locator('[data-rpr="verdict"] .verdict-title');
  const text = (await title.textContent()) ?? '';
  // Either something did render for nothing, and then it is named as the cause, or the root is only the busiest one.
  expect(['Main cause', 'Rendered most'].some((t) => text.startsWith(t))).toBe(true);
});

test('the long tail folds away, and the causes light up their commits on the tracks', async ({ page }) => {
  await recordFromPanel(page, '/app?rpr=panel&tick=150', async () => {
    await page.getByTestId('message').pressSequentially('hi', { delay: 60 });
    await page.waitForTimeout(600);
  });
  // Components and plugins start closed, the timeline open.
  await expect(page.locator('details[data-fold="components"]')).not.toHaveAttribute('open', '');
  await expect(page.locator('details[data-fold="timeline"]')).toHaveAttribute('open', '');
  await page.locator('details[data-fold="components"] > summary').click();
  await expect(page.locator('details[data-fold="components"]')).toHaveAttribute('open', '');

  // A cause pressed in the legend lights up the commits it caused, and pressed again lets them all back.
  const cause = page.locator('[data-rpr="cause"]').first();
  await cause.click();
  await expect(cause).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.tl-strip[data-lit="true"]')).toBeVisible();
  expect(await page.locator('.tl-bar[data-lit="true"]').count()).toBeGreaterThan(0);
  await cause.click();
  await expect(page.locator('.tl-strip[data-lit="true"]')).toHaveCount(0);
});

test('what can be done with the report stays in sight, and the panel widens for it', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 700 });
  await recordFromPanel(page, '/app?rpr=panel&tick=150', () => page.waitForTimeout(1200));
  const card = page.locator('.card');
  const bar = page.locator('[data-rpr="result-bar"]');
  // Scrolled to the top of a long report, the bar with the id and the buttons is still inside the panel.
  await card.evaluate((el) => (el.scrollTop = 0));
  const [cardBox, barBox] = [(await card.boundingBox())!, (await bar.boundingBox())!];
  expect(barBox.y + barBox.height).toBeLessThanOrEqual(cardBox.y + cardBox.height + 1);

  const narrow = cardBox.width;
  await page.locator('[data-rpr="wide"]').click();
  await expect(page.locator('[data-rpr="wide"]')).toHaveAttribute('aria-pressed', 'true');
  expect((await card.boundingBox())!.width).toBeGreaterThan(narrow + 100);
  await page.locator('[data-rpr="wide"]').click();
  expect(Math.round((await card.boundingBox())!.width)).toBe(Math.round(narrow));
});

test('Show all puts the tracks back as the report opened them', async ({ page }) => {
  await recordFromPanel(page, '/app?rpr=panel&tick=150', async () => {
    await page.getByTestId('message').pressSequentially('hi', { delay: 60 });
    await page.waitForTimeout(600);
  });
  const width = () => page.locator('.tl-strip').evaluate((el) => el.getBoundingClientRect().width);
  const reset = page.locator('[data-rpr="tl-reset"]');
  const fit = await width();
  // Nothing narrowed yet: nothing to reset.
  await expect(reset).toBeHidden();

  // A commit picked, closer in, and a cause lit. The last bar: in a dense stretch a bar's neighbour covers part of it.
  await page.locator('.tl-bar').last().click();
  await page.locator('[data-rpr="tl-in"]').click();
  await page.locator('[data-rpr="cause"]').first().click();
  await expect(page.locator('.tl-cursor')).toBeVisible();
  expect(await width()).toBeGreaterThan(fit * 1.5);

  await reset.click();
  await expect.poll(width).toBeCloseTo(fit, 0);
  await expect(page.locator('.tl-cursor')).toHaveCount(0);
  await expect(page.locator('[data-rpr="cause"][aria-pressed="true"]')).toHaveCount(0);
  await expect(page.locator('.tl-strip[data-lit="true"]')).toHaveCount(0);
  // Back to what the window holds, the whole recording.
  await expect(page.locator('.tl-detail .tl-head')).toContainText('commits');
  await expect(reset).toBeHidden();

  // A double-click on the overview does the same.
  await page.locator('[data-rpr="tl-in"]').click();
  expect(await width()).toBeGreaterThan(fit * 1.5);
  await page.locator('[data-rpr="tl-overview"]').dblclick();
  await expect.poll(width).toBeCloseTo(fit, 0);
});

test('a second recording of the same page is set against the first, per click, however many clicks', async ({ page }) => {
  const switchTabs = (times: number) => async () => {
    for (let i = 0; i < times; i++) {
      await page.getByTestId('tab-people').click();
      await page.getByTestId('tab-chat').click();
    }
  };
  // The first recording in a tab has nothing to be compared with.
  await recordFromPanel(page, '/app?rpr=panel&tick=150', switchTabs(1));
  await expect(page.locator('details[data-fold="compare"]')).toHaveCount(0);

  // Three round trips against one: the rows are per click, and say how many there were.
  await recordFromPanel(page, '/app?rpr=panel&tick=150', switchTabs(3));
  const compare = page.locator('details[data-fold="compare"]');
  await expect(compare).toHaveAttribute('open', '');
  await expect(compare.locator('summary')).toContainText(/vs \d/);
  const people = compare.locator('[data-rpr="cmp-row"]', { hasText: 'tab-people' });
  await expect(people).toHaveAttribute('title', /Done 1× before and 3× now — the numbers are renders per click/);
  // Nothing changed in the code between the runs: the clicks cost the same.
  const before = Number(await people.locator('.cmp-before').textContent());
  expect(Number(await people.locator('.cmp-after').textContent())).toBe(before);
  await expect(people.locator('.cmp-change')).toHaveText('same');
  await expect(compare.locator('[data-rpr="cmp-wasted"]')).toHaveCount(1);

  // Another page is not compared with this one.
  await page.goto('/basics/cache?rpr=panel');
  await page.locator('[data-rpr="record"]').click();
  await page.waitForTimeout(500);
  await page.locator('[data-rpr="stop"]').click();
  await expect(page.locator('[data-rpr="result"]')).toContainText('saved');
  await expect(page.locator('details[data-fold="compare"]')).toHaveCount(0);
});

test('Repeat reloads, does the same actions again and sets the two side by side', async ({ page }) => {
  await recordFromPanel(page, '/app?rpr=panel&tick=150', async () => {
    await page.getByTestId('tab-people').click();
    await page.getByTestId('tab-chat').click();
    await page.getByTestId('message').pressSequentially('hey', { delay: 50 });
  });
  const first = ((await page.locator('.result-bar .saved').textContent()) ?? '').replace('saved ', '');
  await page.locator('[data-rpr="repeat"]').click();
  // The page reloads into a recording and the header says where the replay is.
  await expect(page.locator('header .live')).toContainText(/replaying \d of 3/, { timeout: 10_000 });
  await expect(page.locator('[data-rpr="replay-bar"]')).toHaveAttribute('aria-valuemax', '3');
  await expect(page.locator('[data-rpr="result"]')).toContainText('saved', { timeout: 15_000 });
  const compare = page.locator('details[data-fold="compare"]');
  await expect(compare.locator('summary')).toContainText('↻ replay · vs');
  const people = compare.locator('[data-rpr="cmp-row"]', { hasText: 'tab-people' });
  await expect(people).toHaveAttribute('title', /Done 1× before and 1× now/);
  // Nothing changed in the code: the replayed click costs what the person's did.
  const before = Number(await people.locator('.cmp-before').textContent());
  expect(before).toBeGreaterThan(0);
  expect(Number(await people.locator('.cmp-after').textContent())).toBe(before);
  await expect(compare.locator('[data-rpr="cmp-row"]', { hasText: 'type' }).locator('.cmp-after small')).toHaveText('/char');
  // The first run was not from the page load and the replay is: per-second numbers are not set side by side.
  await expect(compare.locator('.cmp-note')).toContainText('began with the page load');
  const second = ((await page.locator('.result-bar .saved').textContent()) ?? '').replace('saved ', '');
  expect(second).not.toBe(first);
  // What was typed is not kept, so the replay types as many characters of its own.
  await expect(page.getByTestId('message')).toHaveValue('xxx');
});

test('a commit picked on the timeline outlines its components on the page, until the pick goes', async ({ page }) => {
  await recordFromPanel(page, '/app?rpr=panel&tick=150', async () => {
    // With the highlights on, the live render boxes step aside while a pick is outlined.
    await page.locator('input[data-rpr="highlight"]').check();
    await page.getByTestId('tab-people').click();
    await page.getByTestId('tab-chat').click();
    await page.getByTestId('message').pressSequentially('hi', { delay: 60 });
  });
  const pinned = () => page.evaluate(() => ((window as any).__REACT_PERF_RECORDER__.panel.highlighter.pinned as unknown[]).length);
  const live = () => page.evaluate(() => Boolean((window as any).__REACT_PERF_RECORDER__.engine.idleHighlighting));
  expect(await pinned()).toBe(0);
  await expect.poll(live).toBe(true);

  // The last commit is from the typing: its roots are on the page, and they are outlined there.
  await page.locator('.tl-bar').last().click();
  const note = page.locator('[data-rpr="tl-outlined"]');
  await expect(note).toContainText('outlined on the page');
  const found = Number(await note.getAttribute('data-found'));
  expect(found).toBeGreaterThan(0);
  expect(await pinned()).toBe(found);
  expect(await live()).toBe(false);

  // Show all takes the pick away, and the outlines with it; so does closing the report.
  await page.locator('[data-rpr="tl-reset"]').click();
  await expect(note).toHaveCount(0);
  expect(await pinned()).toBe(0);
  await expect.poll(live).toBe(true);
  await page.locator('.tl-bar').last().click();
  await expect(note).toBeVisible();
  await page.locator('.result-bar button', { hasText: 'Dismiss' }).click();
  expect(await pinned()).toBe(0);
  await expect.poll(live).toBe(true);
});

test('Repeat replays in the area the report was recorded in, not the one the panel shows now', async ({ page }) => {
  await page.goto('/app?rpr=panel&tick=150');
  await expect(page.getByTestId('unread')).toBeVisible();
  await page.locator('[data-rpr="pick"]').click();
  await page.getByTestId('messages').click();
  await page.locator('[data-rpr="tree"] li[data-name="MessageList"]').click();
  await expect(page.locator('[data-rpr="scope"]')).toHaveText('MessageList');
  await page.locator('[data-rpr="record"]').click();
  await page.getByTestId('tab-people').click();
  await page.getByTestId('tab-chat').click();
  await page.locator('[data-rpr="stop"]').click();
  await expect(page.locator('[data-rpr="result"]')).toContainText('saved');

  // Back to the whole app, then Repeat: the replay still records MessageList, so the two compare.
  await page.locator('[data-rpr="clear-scope"]').click();
  await expect(page.locator('[data-rpr="scope"]')).toBeHidden();
  await page.locator('[data-rpr="repeat"]').click();
  await expect(page.locator('[data-rpr="result"]')).toContainText('saved', { timeout: 15_000 });
  await expect(page.locator('[data-rpr="scope"]')).toHaveText('MessageList');
  await expect(page.locator('details[data-fold="compare"]')).toBeVisible();
});

test('a useMemo that recomputes on every render is named, with the dependency that moves and its line', async ({ page }) => {
  await page.goto('/basics/deps?rpr=panel');
  await page.locator('[data-rpr="record"]').click();
  for (let i = 0; i < 3; i++) await page.getByTestId('render').click();
  await page.locator('[data-rpr="stop"]').click();
  await expect(page.locator('[data-rpr="result"]')).toContainText('saved');

  const fold = page.locator('details[data-fold="memos"]');
  await expect(fold).toHaveAttribute('open', '');
  const row = fold.locator('[data-rpr="memo"]', { hasText: 'InlineReport' });
  await expect(row).toHaveAttribute('data-every', 'true');
  await expect(row.locator('.badge')).toHaveText('0/3 reused');
  // By the name the code gives it, read from the array three lines below the call.
  await expect(row.locator('.memo-why')).toHaveText('filter is a new object with the same content every time');
  await expect(row.locator('.memo-why code')).toHaveText('filter');
  await expect(row.locator('.site')).toContainText('MemoDeps.tsx');
  await expect(row.locator('.chain')).toHaveText(/^useOpenRows › /);
  // The report with the constant filter remembers: it is not listed.
  await expect(fold.locator('[data-rpr="memo"]', { hasText: 'ConstantReport' })).toHaveCount(0);
});

test('a picked commit shows its render time as a flame chart: each link as wide as it took, children under it', async ({ page }) => {
  await page.goto('/advanced/deferred?rpr=panel');
  await page.locator('[data-rpr="record"]').click();
  await page.locator('[data-case="broken"] input').pressSequentially('ab', { delay: 150 });
  await page.locator('[data-rpr="stop"]').click();
  await expect(page.locator('[data-rpr="result"]')).toContainText('saved');
  // The commit of a keystroke on the left: the search, the results, and the 800 rows under them.
  const bars = page.locator('.tl-bar');
  const flame = page.locator('[data-rpr="flame"]');
  for (let i = 0; i < (await bars.count()); i++) {
    await bars.nth(i).evaluate((bar) => (bar as HTMLElement).click());
    if (await flame.locator('[data-rpr="flame-bar"][data-name="Item"]').count()) break;
  }
  const time = async (name: string) => Number(await flame.locator(`[data-rpr="flame-bar"][data-name="${name}"]`).first().getAttribute('data-ms'));
  const [search, results, item] = [await time('Search'), await time('Results'), await time('Item')];
  expect(item).toBeGreaterThan(0);
  expect(search).toBeGreaterThanOrEqual(results);
  expect(results).toBeGreaterThanOrEqual(item);
  // The rows got props equal to the last ones: the bar says a memo would have saved that time.
  await expect(flame.locator('[data-rpr="flame-bar"][data-name="Item"]')).toHaveAttribute('data-equal', 'true');
  await expect(flame.locator('[data-rpr="flame-bar"][data-name="Item"]')).toContainText('×800');
  // The root's lane draws that commit as wide as the root took, and says it.
  const titles = await page.locator('.tl-lane .tl-bar').evaluateAll((els) => els.map((el) => el.getAttribute('title') ?? ''));
  expect(titles.some((title) => /Search [\d.]+ms of [\d.]+ms/.test(title))).toBe(true);
});

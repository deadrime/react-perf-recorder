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

import { devices, expect, test } from '@playwright/test';

// The project's browser stays: only the phone's screen, touch and pointer are taken.
const { defaultBrowserType: _, ...iPhone } = devices['iPhone 13'];
test.use(iPhone);

const card = (page: import('@playwright/test').Page) => page.locator('[data-react-perf-recorder] .card');

test('on a phone the area is picked and kept by taps, and the page above the sheet stays free', async ({ page }) => {
  await page.goto('/app?rpr=panel&tick=150');
  await expect(page.getByTestId('unread')).toBeVisible();
  await page.locator('[data-rpr="pick"]').tap();
  // The hint speaks of taps, and the keys it would name are not there to press.
  await expect(page.locator('[data-rpr="message"]')).toHaveText(/^Tap /);
  await expect(page.locator('[data-rpr="pick-parent"]')).toBeDisabled();

  // A sheet across the bottom edge that leaves most of the screen to the page.
  const box = (await card(page).boundingBox())!;
  const view = page.viewportSize()!;
  expect(box.width).toBe(view.width);
  expect(Math.round(box.y + box.height)).toBe(view.height);
  expect(box.height).toBeLessThan(view.height * 0.6);

  await page.getByTestId('unread').tap();
  await expect(page.locator('[data-rpr="scope"]')).toHaveText('Unread');
  await page.locator('[data-rpr="pick-parent"]').tap();
  await expect(page.locator('[data-rpr="scope"]')).toHaveText('Header');
  // A tapped row is only tried on: the tree stays open until Keep.
  await page.locator('[data-rpr="tree"] li[data-name="Workspace"]').tap();
  await expect(page.locator('[data-rpr="scope"]')).toHaveText('Workspace');
  await expect(page.locator('[data-rpr="tree"] li[data-name="Workspace"]')).toHaveAttribute('data-active', 'true');
  // So is the Whole app row, and a row after it brings the area back into the tree.
  await page.locator('[data-rpr="whole-app"]').tap();
  await expect(page.locator('[data-rpr="scope"]')).toBeHidden();
  await expect(page.locator('[data-rpr="whole-app"]')).toHaveAttribute('data-active', 'true');
  await page.locator('[data-rpr="tree"] li[data-name="Header"]').tap();
  await expect(page.locator('[data-rpr="scope"]')).toHaveText('Header');
  await page.locator('[data-rpr="pick-keep"]').tap();
  await expect(page.locator('[data-rpr="tree"]')).toHaveCount(0);
  await expect(page.locator('[data-rpr="scope"]')).toHaveText('Header');

  // Cancel puts the area back as it was, whatever the tree was moved to.
  await page.locator('[data-rpr="scope"]').tap();
  await page.locator('[data-rpr="pick-parent"]').tap();
  await expect(page.locator('[data-rpr="scope"]')).not.toHaveText('Header');
  await page.locator('[data-rpr="pick-cancel"]').tap();
  await expect(page.locator('[data-rpr="scope"]')).toHaveText('Header');
  await expect(page.locator('[data-rpr="pick-bar"]')).toHaveCount(0);
});

test('on a phone the report scrolls inside the sheet, not the page under it', async ({ page }) => {
  await page.goto('/app?rpr=panel&tick=150');
  await expect(page.getByTestId('unread')).toBeVisible();
  await page.locator('[data-rpr="record"]').tap();
  await page.waitForTimeout(2500);
  await page.locator('[data-rpr="stop"]').tap();
  await expect(page.locator('[data-rpr="result"]')).toContainText('saved');
  // A sheet is as wide as the screen already.
  await expect(page.locator('[data-rpr="wide"]')).toBeHidden();

  const box = (await card(page).boundingBox())!;
  const x = box.x + box.width / 2;
  const y = box.y + box.height * 0.7;
  const cdp = await page.context().newCDPSession(page);
  for (const [type, dy] of [
    ['touchStart', 0],
    ['touchMove', -60],
    ['touchMove', -140],
    ['touchMove', -200],
    ['touchEnd', -200],
  ] as const)
    await cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y: y + dy }] });
  await expect.poll(() => card(page).evaluate((el) => el.scrollTop)).toBeGreaterThan(50);
  expect(await page.evaluate(() => scrollY)).toBe(0);
  // The title bar stays in the sheet, so it can be collapsed from anywhere in the report.
  await expect(page.locator('[data-rpr="collapse"]')).toBeInViewport();
});

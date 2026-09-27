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
  // Confirm last, at the thumb; stepping out is a tap on the row above, so there is no Parent.
  await expect(page.locator('[data-rpr="pick-bar"] button')).toHaveText(['✕ Cancel', '✓ Confirm']);

  // A sheet across the bottom edge that leaves most of the screen to the page.
  const box = (await card(page).boundingBox())!;
  const view = page.viewportSize()!;
  expect(box.width).toBe(view.width);
  expect(Math.round(box.y + box.height)).toBe(view.height);
  expect(box.height).toBeLessThan(view.height * 0.6);

  await page.getByTestId('unread').tap();
  await expect(page.locator('[data-rpr="scope"]')).toHaveText('Unread');
  // The area and Cancel · Confirm share one row: recording and the area's own buttons step aside while picking.
  await expect(page.locator('[data-rpr="record"]')).toBeHidden();
  const [area, confirm] = await Promise.all(['scope', 'pick-confirm'].map((id) => page.locator(`[data-rpr="${id}"]`).boundingBox()));
  expect(Math.abs(area!.y + area!.height / 2 - (confirm!.y + confirm!.height / 2))).toBeLessThan(4);
  // A tapped row is only tried on: the tree stays open until Confirm.
  await page.locator('[data-rpr="tree"] li[data-name="Workspace"]').tap();
  await expect(page.locator('[data-rpr="scope"]')).toHaveText('Workspace');
  await expect(page.locator('[data-rpr="tree"] li[data-name="Workspace"]')).toHaveAttribute('data-active', 'true');
  // So is the Whole app row, and a row after it brings the area back into the tree.
  await page.locator('[data-rpr="whole-app"]').tap();
  await expect(page.locator('[data-rpr="scope"]')).toBeHidden();
  await expect(page.locator('[data-rpr="whole-app"]')).toHaveAttribute('data-active', 'true');
  await page.locator('[data-rpr="tree"] li[data-name="Header"]').tap();
  await expect(page.locator('[data-rpr="scope"]')).toHaveText('Header');
  await page.locator('[data-rpr="pick-confirm"]').tap();
  await expect(page.locator('[data-rpr="tree"]')).toHaveCount(0);
  await expect(page.locator('[data-rpr="scope"]')).toHaveText('Header');

  // Cancel puts the area back as it was, whatever the tree was moved to.
  await page.locator('[data-rpr="scope"]').tap();
  await page.locator('[data-rpr="tree"] li[data-name="Layout"]').tap();
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

test('on a phone an outline stays on its element while the page scrolls under it', async ({ page }) => {
  // No feed ticks: the one render is the typed letter, so no fresh measure hides a stale box.
  await page.goto('/app?rpr=panel&tick=600000');
  await expect.poll(() => page.evaluate(() => Boolean((window as any).__REACT_PERF_RECORDER__?.engine.idleHighlighting))).toBe(true);
  await page.locator('[data-rpr="collapse"]').tap();
  await page.getByTestId('message').pressSequentially('a');
  /** How much the overlay has drawn on the left edge of the Send button, where it is now. */
  const onEdge = () =>
    page.evaluate(() => {
      const canvas = document.querySelector('[data-react-perf-recorder]')!.shadowRoot!.querySelector('canvas')!;
      const r = document.querySelector('[data-testid="send"]')!.getBoundingClientRect();
      const dpr = canvas.width / innerWidth;
      const data = canvas
        .getContext('2d')!
        .getImageData(Math.round((r.left - 1) * dpr), Math.round((r.top + r.height / 2) * dpr), Math.ceil(4 * dpr), 1).data;
      return Math.max(...data.filter((_, i) => i % 4 === 3));
    });
  await expect.poll(onEdge).toBeGreaterThan(0);
  await page.evaluate(() => window.scrollBy(0, 120));
  await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
  expect(await onEdge()).toBeGreaterThan(0);
});

test('on a phone the timeline fits a long recording, and two fingers zoom it', async ({ page }) => {
  await page.goto('/app?rpr=panel&tick=150');
  await expect(page.getByTestId('unread')).toBeVisible();
  await page.locator('[data-rpr="record"]').tap();
  // Longer than the tracks held at the old floor of 0.06px a millisecond: about 4.5s on this screen.
  await page.waitForTimeout(7000);
  await page.locator('[data-rpr="stop"]').tap();
  await expect(page.locator('[data-rpr="result"]')).toContainText('saved');
  const tracks = page.locator('.tl-scroll');
  await tracks.scrollIntoViewIfNeeded();
  const size = () => tracks.evaluate((el) => ({ strip: el.firstElementChild!.clientWidth, view: el.clientWidth, left: el.scrollLeft }));
  const fit = await size();
  expect(fit.strip).toBeLessThanOrEqual(fit.view + 1);
  await expect(page.locator('[data-rpr="tl-out"]')).toBeDisabled();

  // Fingers 40px apart spread to 120px around the same middle: three times closer, the middle held still.
  const box = (await tracks.boundingBox())!;
  const middle = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  const cdp = await page.context().newCDPSession(page);
  const touch = (type: 'touchStart' | 'touchMove' | 'touchEnd', half: number) =>
    cdp.send('Input.dispatchTouchEvent', {
      type,
      touchPoints:
        type === 'touchEnd'
          ? []
          : [
              { x: middle - half, y, id: 1 },
              { x: middle + half, y, id: 2 },
            ],
    });
  await touch('touchStart', 20);
  for (const half of [30, 40, 50, 60]) await touch('touchMove', half);
  await touch('touchEnd', 60);
  await expect(page.locator('.tl-controls .muted').first()).toHaveText('×3.0');
  const zoomed = await size();
  expect(zoomed.strip / fit.strip).toBeGreaterThan(2.5);
  // The moment that was under the middle is still there: it moved out by twice its distance from the left edge.
  expect(Math.abs(zoomed.left - 2 * (middle - box.x))).toBeLessThan(12);
  // A pinch is not a tap on a bar.
  await expect(page.locator('.tl-bar[data-picked="true"]')).toHaveCount(0);
});

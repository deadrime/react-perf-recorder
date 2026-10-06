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

  // A tap takes the element under the finger; the row above it is the component it sits in.
  await page.getByTestId('unread').tap();
  await expect(page.locator('[data-rpr="scope"]')).toHaveAttribute('data-element', 'true');
  await page.locator('[data-rpr="tree"] li[data-name="Unread"]').tap();
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

  // Fingers 40px apart spread to 120px around the same middle.
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
  // Every frame of the pinch: the overview's box may only narrow around the middle, never jump away and back; a bar
  // may only move away from the middle, never step back; and the bars are moved, not made anew on every step.
  await page.locator('.tl-brush').evaluate((brush, middle) => {
    const root = brush.getRootNode() as ShadowRoot;
    const seen = ((window as any).__pinch = { centres: [] as number[], bars: [] as Array<Record<string, number>>, added: 0 });
    new MutationObserver((changes) => {
      for (const change of changes) for (const node of change.addedNodes) if ((node as Element).classList?.contains('tl-bar')) seen.added++;
    }).observe(root, { childList: true, subtree: true });
    const sample = () => {
      const box = brush as HTMLElement;
      seen.centres.push(parseFloat(box.style.left) + parseFloat(box.style.width) / 2);
      const bars: Record<string, number> = {};
      for (const bar of root.querySelectorAll<HTMLElement>('.tl-bar')) bars[bar.title.split(' ·')[0]] = bar.getBoundingClientRect().left - middle;
      seen.bars.push(bars);
      if (seen.centres.length < 600) requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  }, middle);
  const before = await page.locator('.tl-bar').count();
  await touch('touchStart', 20);
  for (const half of [24, 28, 32, 36, 40, 44, 48, 52, 56, 60]) await touch('touchMove', half);
  await touch('touchEnd', 60);
  await page.waitForTimeout(100);
  const seen = await page.evaluate(() => {
    const got = (window as any).__pinch;
    (window as any).__pinch = { centres: [], bars: [], added: 0 };
    return got as { centres: number[]; bars: Array<Record<string, number>>; added: number };
  });
  expect(Math.max(...seen.centres.slice(1).map((c, i) => Math.abs(c - seen.centres[i])))).toBeLessThan(2);
  let back = 0;
  seen.bars.slice(1).forEach((now, i) => {
    for (const [at, x] of Object.entries(now)) {
      const was = seen.bars[i][at];
      if (was !== undefined) back = Math.max(back, -Math.sign(was) * (x - was));
    }
  });
  expect(back).toBeLessThan(0.5);
  expect(seen.added).toBeLessThan(before);
  // However hard PINCH_SPEED makes it zoom, it zooms in, and the moment under the middle stays under it.
  await expect(page.locator('.tl-controls .muted').first()).not.toHaveText('fit');
  const zoomed = await size();
  const by = zoomed.strip / fit.strip;
  expect(by).toBeGreaterThan(1.3);
  expect(Math.abs(zoomed.left - (by - 1) * (middle - box.x))).toBeLessThan(12);
  // A pinch is not a tap on a bar.
  await expect(page.locator('.tl-bar[data-picked="true"]')).toHaveCount(0);

  // A finger whose lift only the window heard (its bar re-rendered away) is not the first of the next pinch.
  // Synthetic events: CDP touches always lift on the tracks and never leave a finger behind.
  const label = await page.locator('.tl-controls .muted').first().textContent();
  const panned = await tracks.evaluate(async (el) => {
    const r = el.getBoundingClientRect();
    const at = (type: string, pointerId: number, x: number, target: EventTarget = el) =>
      target.dispatchEvent(
        new PointerEvent(type, {
          pointerId,
          pointerType: 'touch',
          isPrimary: true,
          clientX: x,
          clientY: r.top + r.height / 2,
          bubbles: true,
          composed: true,
          cancelable: true,
        })
      );
    const x = r.left + r.width / 2;
    at('pointerdown', 11, x);
    at('pointerup', 11, x, window);
    const before = el.scrollLeft;
    at('pointerdown', 12, x);
    for (const dx of [10, 30, 60]) at('pointermove', 12, x - dx);
    at('pointerup', 12, x - 60);
    await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
    return el.scrollLeft - before;
  });
  expect(panned).toBe(60);
  await expect(page.locator('.tl-controls .muted').first()).toHaveText(label!);

  // The overview takes a range every time, not only the first.
  const over = (await page.locator('[data-rpr="tl-overview"]').boundingBox())!;
  const brush = () => page.locator('.tl-brush').evaluate((el) => Math.round(parseFloat((el as HTMLElement).style.left)));
  const swipe = async (points: Array<[number, number]>) => {
    await touch1('touchStart', points[0]);
    for (const p of points.slice(1)) await touch1('touchMove', p);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  };
  const touch1 = (type: 'touchStart' | 'touchMove', [x, y]: [number, number]) =>
    cdp.send('Input.dispatchTouchEvent', { type, touchPoints: [{ x, y, id: 3 }] });
  const oy = over.y + over.height / 2;
  for (const [a, b] of [
    [0.1, 0.4],
    [0.5, 0.9],
  ]) {
    await swipe([
      [over.x + over.width * a, oy],
      [over.x + over.width * ((a + b) / 2), oy],
      [over.x + over.width * b, oy],
    ]);
    await expect.poll(brush).toBe(a * 100);
  }

  // The tracks take every touch, so up and down on them scrolls the panel itself.
  const panelTop = () => card(page).evaluate((el) => el.scrollTop);
  const top = await panelTop();
  await swipe([
    [middle, y],
    [middle + 2, y - 30],
    [middle + 3, y - 80],
  ]);
  expect(await panelTop()).toBeGreaterThan(top + 40);
});

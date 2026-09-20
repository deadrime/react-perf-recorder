import { expect, test, type Page } from '@playwright/test';

const SHADOW = '[data-react-perf-recorder]';

const rowsOf = (page: Page) =>
  page.locator('[data-rpr="tree"] li').evaluateAll((items) =>
    items.map((li) => ({
      name: (li as HTMLElement).dataset.name ?? '',
      arrow: li.querySelector('[data-rpr="expand"]')!.textContent ?? '',
      active: (li as HTMLElement).dataset.active ?? '',
      indent: (li as HTMLElement).style.paddingLeft,
    }))
  );

/** Nodes added and removed in the panel while the area moves; whole subtrees count. */
const watchChurn = (page: Page) =>
  page.evaluate((shadow) => {
    const container = document.querySelector(shadow)!.shadowRoot!.querySelector('[data-rpr="picker"]')!;
    const counts = { added: 0, removed: 0 };
    const size = (n: Node) => (n.nodeType === 1 ? 1 + (n as Element).querySelectorAll('*').length : 1);
    const sum = (nodes: NodeList) => [...nodes].reduce((total, n) => total + size(n), 0);
    new MutationObserver((records) => {
      for (const r of records) {
        counts.added += sum(r.addedNodes);
        counts.removed += sum(r.removedNodes);
      }
    }).observe(container, { childList: true, subtree: true });
    (window as unknown as { __churn: typeof counts }).__churn = counts;
  }, SHADOW);

const churn = (page: Page) => page.evaluate(() => (window as unknown as { __churn: Record<string, number> }).__churn);
const scrollOf = (page: Page) => page.locator('[data-rpr="tree"]').evaluate((ul) => Math.round(ul.scrollLeft));

test('moving the area patches the tree instead of drawing it again', async ({ page }) => {
  await page.goto('/app?rpr=panel&tick=150');
  await expect(page.getByTestId('unread')).toBeVisible();
  await page.locator('[data-rpr="pick"]').click();
  await page.getByTestId('message-m1').click();
  await expect(page.locator('[data-rpr="scope"]')).toHaveText('MessageRow');

  const rows = await rowsOf(page);
  expect(rows.filter((r) => r.name === 'MessageRow')).toHaveLength(3);
  expect(rows.find((r) => r.active === 'true')!.name).toBe('MessageRow');
  expect(rows.find((r) => r.name === 'Status')!.arrow).toBe('');

  // Five steps down: the rows are patched, so nothing is thrown away and the list keeps where it was scrolled to.
  const activeAt = () =>
    page.locator('[data-rpr="tree"] li').evaluateAll((els) => els.findIndex((e) => (e as HTMLElement).dataset.active === 'true'));
  const from = await activeAt();
  await page.locator('[data-rpr="tree"]').evaluate((ul) => (ul.scrollLeft = 120));
  const scrolled = await scrollOf(page);
  await watchChurn(page);
  for (let i = 0; i < 5; i++) await page.keyboard.press('ArrowDown');
  expect(await activeAt()).toBeGreaterThan(from);
  expect(await churn(page)).toEqual({ added: 0, removed: 0 });
  // Whatever the list was scrolled to is still there; a rebuilt list would be back at the left edge.
  expect(await scrollOf(page)).toBe(scrolled);

  // The controls inside a row work through the patched rendering (they show on the active row only).
  const activeName = await page.locator('[data-rpr="tree"] li[data-active="true"]').getAttribute('data-name');
  await page.locator('[data-rpr="tree"] li[data-active="true"] [data-rpr="watch-toggle"]').click();
  await expect(page.locator(`[data-rpr="watch"] [data-name="${activeName}"]`)).toBeVisible();

  // Closing empties the container; opening it again draws the tree from scratch.
  await page.locator('[data-rpr="tree"] li[data-active="true"]').click();
  await expect(page.locator('[data-rpr="tree"]')).toHaveCount(0);
  await page.locator('[data-rpr="scope"]').click();
  await expect(page.locator('[data-rpr="tree"] li[data-active="true"]')).toHaveCount(1);
  expect((await rowsOf(page)).filter((r) => r.name === 'MessageRow')).toHaveLength(3);
});

test('packages and providers each hide behind a checkbox of their own', async ({ page }) => {
  await page.goto('/app?rpr=panel&tick=150');
  await expect(page.getByTestId('unread')).toBeVisible();
  await page.locator('[data-rpr="pick"]').click();
  await page.locator('[data-testid="message-m1"] .text').click();
  const names = () => page.locator('[data-rpr="tree"] li').evaluateAll((els) => els.map((el) => (el as HTMLElement).dataset.name));

  // By default the path is the app's own components: no router internals, no component that only holds a context.
  expect(await names()).not.toContain('SettingsProvider');
  expect(await names()).not.toContain('RenderedRoute');

  await page.locator('[data-rpr="show-providers"]').check();
  expect(await names()).toContain('SettingsProvider');
  expect(await names()).not.toContain('RenderedRoute');

  await page.locator('[data-rpr="show-library"]').check();
  expect(await names()).toContain('RenderedRoute');
});

test('hovering shows the box the click would leave', async ({ page }) => {
  await page.goto('/app?rpr=panel&tick=150');
  await expect(page.getByTestId('unread')).toBeVisible();
  await page.locator('[data-rpr="pick"]').click();
  await page.getByTestId('tab-people').hover();
  const box = (page: Page) =>
    page.evaluate(() => {
      const el = document.querySelector('[data-react-perf-recorder]')!.shadowRoot!.querySelector('.box')!;
      const r = el.getBoundingClientRect();
      return { tag: el.querySelector('.tag')!.textContent, w: Math.round(r.width) };
    });
  const hovered = await box(page);
  await page.getByTestId('tab-people').click();
  // The same component, the same box: the outline under the cursor is the choice, not the element it sits on.
  await expect(page.locator('[data-rpr="scope"]')).toHaveText(hovered.tag!);
  expect((await box(page)).w).toBe(hovered.w);
});

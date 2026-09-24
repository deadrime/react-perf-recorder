import { expect, test, type Page } from '@playwright/test';
import type { RecorderGlobal } from '../../src/client';
import type { RecordingV2 } from '../../src/shared/schema';
import { hookOf, hookText, reasonsById, textOf, wayText } from '../../src/shared/summary';

/**
 * Every panel of a textbook case says what the recorder will say about it. These record the scenario and check the
 * words: a page that promises `parent: props same: icon` and gets something else is teaching the wrong thing.
 */
const record = async (page: Page, url: string, act: () => Promise<void>) => {
  await page.goto(url);
  await page.locator('[data-case]').first().waitFor();
  await page.waitForTimeout(300);
  await page.evaluate(() => (window.__REACT_PERF_RECORDER__ as RecorderGlobal).engine.start({ source: 'e2e', highlight: false }));
  await act();
  return page.evaluate(() => (window.__REACT_PERF_RECORDER__ as RecorderGlobal).engine.stop()) as Promise<RecordingV2>;
};

/** What a root or a component rendered for, in the words the panel and the MCP server use. */
const said = (rec: RecordingV2, name: string) => {
  const byId = reasonsById(rec.reasons);
  const root = rec.roots.find((r) => r.name === name);
  const stat = root ?? rec.components.find((c) => c.name === name);
  return (stat?.reasons ?? []).map(([id]) => {
    const reason = byId.get(id);
    const hook = root && reason ? hookText(hookOf(root, reason), 'short') : '';
    return `${reason ? textOf(reason) : '?'}${hook ? ` · ${hook}` : ''}`;
  });
};

test('an element written in render: parent: props same: icon', async ({ page }) => {
  const rec = await record(page, '/basics/props', async () => {
    for (let i = 0; i < 3; i++) await page.getByTestId('render').click();
  });
  expect(said(rec, 'Badge')).toContain('parent: props same: icon');
});

test('a value object built in the provider: context SAME-CONTENT on the readers', async ({ page }) => {
  // Nothing is pressed: the clock above the providers renders them, and the value they hand out does not change.
  const rec = await record(page, '/basics/context', () => page.waitForTimeout(2200));
  expect(said(rec, 'InlineUser')[0]).toMatch(/^context InlineContext SAME-CONTENT/);
  expect(said(rec, 'InlineTheme')[0]).toMatch(/^context InlineContext SAME-CONTENT/);
  expect(rec.roots.map((r) => r.name)).not.toContain('StableUser');
});

test('a clock hidden in a hook: the hook chain names it', async ({ page }) => {
  const rec = await record(page, '/basics/state', () => page.waitForTimeout(3000));
  expect(said(rec, 'DueByClock')[0]).toMatch(/^state #0 · useOverdueByClock › useSecond/);
  // The hook that keeps the answer renders once, when it flips.
  expect(rec.roots.find((r) => r.name === 'DueByTimer')?.hits ?? 0).toBeLessThanOrEqual(1);
});

test('a render that came down from a clock keeps its way: the timer, the card, the item that got equal props', async ({ page }) => {
  const rec = await record(page, '/basics/state', () => page.waitForTimeout(2500));
  const ways = rec.components.find((c) => c.name === 'RenderCount')?.chains?.map((c) => wayText(rec, c.links)) ?? [];
  expect(ways).toContainEqual(expect.stringMatching(/^core:timer setInterval @ src\/basics\/StateDown\.tsx › CardWithClock · state #0 › Item · props equal › RenderCount · n$/));

  // The panel draws the same way, with the link where a memo would stop it marked.
  await page.goto('/basics/state?rpr=panel');
  await page.locator('[data-rpr="record"]').click();
  await page.waitForTimeout(2200);
  await page.locator('[data-rpr="stop"]').click();
  await page.locator('details[data-fold="components"] > summary').click();
  const way = page.locator('[data-rpr="way"]', { hasText: 'CardWithClock' }).filter({ hasText: 'RenderCount' }).first();
  await expect(way.locator('.way-cause')).toHaveText('setInterval @ StateDown.tsx');
  await expect(way.locator('.way-step[data-equal="true"] .way-name')).toHaveText('Item');
});

test('a subscription for a click: external store on the composer', async ({ page }) => {
  const rec = await record(page, '/basics/snapshot', () => page.waitForTimeout(1600));
  expect(said(rec, 'Subscribed')[0]).toMatch(/external store #\d+ \[presence\] \(s\)=>s\.typing/);
  expect(rec.roots.map((r) => r.name)).not.toContain('ReadOnClick');
});

test('a cache smaller than the rows: proxy-memoize says it evicts answers in use', async ({ page }) => {
  const rec = await record(page, '/basics/cache', () => page.waitForTimeout(1600));
  const notes = rec.plugins['proxy-memoize']?.highlights ?? [];
  expect(notes.find((n) => n.startsWith('selectTight'))).toMatch(/4 argument sets > cache size 2/);
  // The rows' own selectors are not named, and none of them evicts.
  const selectors = (rec.plugins['proxy-memoize']?.data as { selectors: Array<{ name: string; evicting: boolean }> }).selectors;
  expect(selectors.filter((x) => x.evicting).map((x) => x.name)).toEqual(['selectTight']);
  expect(said(rec, 'TightRow')[0]).toMatch(/SAME-CONTENT \[board\] \(s\)=>selectTight\(s, id\)/);
});

test('a value only a handler reads, kept in state: state #0 for every move', async ({ page }) => {
  const rec = await record(page, '/basics/ref', async () => {
    const pad = (await page.getByTestId('pad-state').boundingBox())!;
    await page.mouse.move(pad.x + 10, pad.y + 10);
    await page.mouse.move(pad.x + pad.width - 10, pad.y + 40, { steps: 12 });
  });
  expect(said(rec, 'PadWithState')[0]).toMatch(/^state #0/);
  expect(rec.roots.find((r) => r.name === 'PadWithState')!.hits).toBeGreaterThan(5);
  expect(rec.roots.map((r) => r.name)).not.toContain('PadWithRef');
});

test('a handler with the text in its deps: parent: props same: onSend', async ({ page }) => {
  const rec = await record(page, '/basics/ref', () => page.getByTestId('text-deps').pressSequentially('hello', { delay: 30 }));
  expect(said(rec, 'SendButton')).toContain('parent: props same: onSend');
});

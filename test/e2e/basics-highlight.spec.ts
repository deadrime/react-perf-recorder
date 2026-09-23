import { expect, test, type Page } from '@playwright/test';

/**
 * The basics pages are read with the outlines on: whatever the counters say, the fixed side has to light up less
 * than the broken one, or the page shows the opposite of what it teaches. Every outline drawn is counted by the
 * side of the pair it lands in.
 */
type Flash = { side: string; pair: string; name: string; mounted: boolean };

const watchFlashes = (page: Page) =>
  page.evaluate(() => {
    const w = window as unknown as { __REACT_PERF_RECORDER__: { panel: { highlighter: any } }; __flashes: Flash[] };
    const highlighter = w.__REACT_PERF_RECORDER__.panel.highlighter;
    w.__flashes = [];
    const flash = highlighter.flash.bind(highlighter);
    highlighter.flash = (pairs: Array<[Element, string, unknown]>, withoutDom: Set<unknown>, mounted?: Set<unknown>) => {
      for (const [el, name, fiber] of pairs)
        w.__flashes.push({
          side: (el.closest('[data-case]') as HTMLElement | null)?.dataset.case ?? 'outside',
          pair: (el.closest('[data-pair]') as HTMLElement | null)?.dataset.pair ?? '',
          name,
          mounted: mounted?.has(fiber) ?? false,
        });
      return flash(pairs, withoutDom, mounted);
    };
  });

const flashes = (page: Page) => page.evaluate(() => (window as unknown as { __flashes: Flash[] }).__flashes);
const count = (all: Flash[], side: string, pair = '') => all.filter((f) => f.side === side && (!pair || f.pair === pair)).length;

const open = async (page: Page, id: string) => {
  await page.goto(`/basics/${id}?rpr=panel`);
  // The outlines come on once the app has rendered and the panel has taken the commit hook.
  await expect.poll(() => page.evaluate(() => Boolean((window as any).__REACT_PERF_RECORDER__?.engine.idleHighlighting))).toBe(true);
  await watchFlashes(page);
};

const typeInto = (page: Page, id: string, text: string) => page.getByTestId(id).pressSequentially(text, { delay: 40 });

const CASES: Array<{ id: string; pairs?: string[]; act: (page: Page) => Promise<void> }> = [
  {
    id: 'memo',
    act: async (page) => {
      for (let i = 0; i < 3; i++) await page.getByTestId('render').click();
    },
  },
  {
    id: 'keys',
    act: async (page) => {
      await page.getByTestId('prepend').click();
      await page.getByTestId('prepend').click();
    },
  },
  {
    id: 'props',
    pairs: ['objects', 'element'],
    act: async (page) => {
      for (let i = 0; i < 3; i++) await page.getByTestId('render').click();
    },
  },
  { id: 'state', pairs: ['where', 'hook'], act: (page) => page.waitForTimeout(3000) },
  {
    id: 'ref',
    pairs: ['latest'],
    act: async (page) => {
      await typeInto(page, 'text-deps', 'hi');
      await typeInto(page, 'text-ref', 'hi');
    },
  },
  {
    id: 'context',
    pairs: ['split', 'inline'],
    act: async (page) => {
      await page.waitForTimeout(2100);
      await page.getByTestId('user').click();
    },
  },
  { id: 'subscriptions', act: (page) => page.waitForTimeout(2000) },
  { id: 'snapshot', act: (page) => page.waitForTimeout(2000) },
  { id: 'cache', act: (page) => page.waitForTimeout(2000) },
  { id: 'effect', act: (page) => typeInto(page, 'first', 'Anna') },
  { id: 'children', act: (page) => page.waitForTimeout(2200) },
  {
    id: 'router',
    act: async (page) => {
      await page.getByTestId('folder-sent').click();
      await page.getByTestId('folder-spam').click();
    },
  },
  {
    id: 'form',
    act: async (page) => {
      await typeInto(page, 'u-title', 'Hi');
      await typeInto(page, 'c-title', 'Hi');
    },
  },
];

for (const { id, pairs, act } of CASES) {
  test(`with the outlines on, the fixed side of ${id} lights up less`, async ({ page }) => {
    await open(page, id);
    await act(page);
    await page.waitForTimeout(200);
    const all = await flashes(page);
    // The frames of the two versions and their code never render with the lesson: a box over a whole side would
    // say the fixed one rendered too.
    expect(all.filter((f) => f.name === 'Panel' || f.name === 'Code')).toEqual([]);
    for (const pair of pairs ?? ['']) {
      const broken = count(all, 'broken', pair);
      const fixed = count(all, 'fixed', pair);
      expect(broken, `${id}${pair ? `/${pair}` : ''}: ${broken} outlines broken, ${fixed} fixed`).toBeGreaterThan(fixed);
    }
  });
}

test('with the outlines on, a component declared in a render shows as mounted again, the fixed one as rendered', async ({ page }) => {
  await open(page, 'nested');
  await page.getByTestId('render').click();
  await page.getByTestId('render').click();
  await page.waitForTimeout(200);
  const all = await flashes(page);
  expect(all.filter((f) => f.side === 'broken' && f.mounted).length).toBeGreaterThanOrEqual(4);
  expect(all.filter((f) => f.side === 'fixed' && f.mounted)).toEqual([]);
  expect(all.some((f) => f.side === 'fixed' && f.name === 'Outside')).toBe(true);
});

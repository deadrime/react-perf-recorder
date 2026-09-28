import { expect, test, type Page } from '@playwright/test';
import type { RecorderGlobal } from '../../src/client';
import type { RecordingV2 } from '../../src/shared/schema';
import { hookOf, hookText, reasonsById, textOf, waysOf, wayText } from '../../src/shared/summary';

/**
 * Every panel of a textbook case says what the recorder will say about it. These record the scenario and check the
 * words: a page that promises `parent: props new ref, same content: icon` and gets something else is teaching the wrong thing.
 */
const record = async (page: Page, url: string, act: () => Promise<void>, ready?: () => Promise<void>) => {
  await page.goto(url);
  await page.locator('[data-case]').first().waitFor();
  await ready?.();
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

test('an element written in render: parent: props new ref, same content: icon', async ({ page }) => {
  const rec = await record(page, '/basics/props', async () => {
    for (let i = 0; i < 3; i++) await page.getByTestId('render').click();
  });
  expect(said(rec, 'Badge')).toContain('parent: props new ref, same content: icon');
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
  const ways = waysOf(rec, rec.components.find((c) => c.name === 'RenderCount')?.chains).map(wayText);
  expect(ways).toContainEqual(
    expect.stringMatching(
      /^core:timer setInterval @ src\/basics\/StateDown\.tsx › CardWithClock · state useSecond › Item · props equal › RenderCount · prop renders$/
    )
  );

  // The panel draws the same way, with the link where a memo would stop it marked.
  await page.goto('/basics/state?rpr=panel');
  await page.locator('[data-rpr="record"]').click();
  await page.waitForTimeout(2200);
  await page.locator('[data-rpr="stop"]').click();
  await page.locator('details[data-fold="components"] > summary').click();
  const way = page.locator('[data-rpr="way"]', { hasText: 'CardWithClock' }).filter({ hasText: 'RenderCount' }).first();
  await expect(way.locator('.way-cause')).toHaveText('setInterval @ StateDown.tsx');
  await expect(way.locator('.way-step[data-equal="true"] .way-name')).toHaveText('Item');
  // The way ends in what the parent changed, so the card does not say it again as a reason of its own.
  const card = page.locator('.stat', { has: page.locator('.stat-name', { hasText: /^RenderCount$/ }) });
  await expect(card.locator('.kind', { hasText: 'parent' })).toHaveCount(0);

  // A commit of the card's clock, picked on the timeline, shows its cascade as a tree.
  const bars = page.locator('.tl-bar');
  const tree = page.locator('[data-rpr="cascade"]');
  // Clicked from the page: a bar scrolled out of the tracks is still a commit to look at, but never "visible".
  for (let i = 0; i < (await bars.count()); i++) {
    await bars.nth(i).evaluate((bar) => (bar as HTMLElement).click());
    if (await tree.filter({ hasText: 'CardWithClock' }).count()) break;
  }
  const rows = tree.locator('[data-rpr="cascade-row"]');
  await expect(rows.first()).toContainText('CardWithClock');
  await expect(tree.locator('[data-rpr="cascade-row"][data-equal="true"]').first()).toContainText('Item');
  await expect(rows.filter({ hasText: 'RenderCount' }).first()).toContainText('prop');
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

test('a handler with the text in its deps: parent: props new ref, same content: onSend', async ({ page }) => {
  const rec = await record(page, '/basics/ref', () => page.getByTestId('text-deps').pressSequentially('hello', { delay: 30 }));
  expect(said(rec, 'SendButton')).toContain('parent: props new ref, same content: onSend');
});

test('an empty default: parent: props new ref, same content: marks, on rows nobody selected', async ({ page }) => {
  const rec = await record(page, '/advanced/empty', () => page.getByTestId('select-next').click());
  expect(said(rec, 'Row')).toContain('parent: props new ref, same content: marks');
  expect(said(rec, 'Row')).toContain('parent: props selected');
});

test('a whole copy of the form: parent: props new ref, same content: value, on the groups not typed into', async ({ page }) => {
  const rec = await record(page, '/advanced/copy', () => page.getByTestId('broken-contact-name').pressSequentially('bc', { delay: 30 }));
  expect(said(rec, 'Group').sort()).toEqual(['parent: props new ref, same content: value', 'parent: props value']);
});

test("a package's context: named by the component that provides it", async ({ page }) => {
  const rec = await record(page, '/advanced/context', () => page.getByTestId('note-broken').pressSequentially('ab', { delay: 30 }));
  // A root here: the hook chain follows, down to the package's hook the card calls.
  expect(said(rec, 'Card')).toEqual([expect.stringMatching(/^context \(unnamed, provided by SortableList\) SAME-CONTENT · useSortable/)]);
});

test('a Redux store: named after its declaration, with the action that changed it', async ({ page }) => {
  const rec = await record(page, '/advanced/redux', () => page.getByTestId('star-next').click());
  expect(said(rec, 'WholeList')[0]).toMatch(/^external store #\d+ \[wholeListStore\]/);
  expect(said(rec, 'OwnFlag')[0]).toMatch(/^external store #\d+ \[ownFlagStore\]/);
  expect(rec.causes.map((c) => c.key)).toContain('redux:favorites/toggle');
  expect(rec.plugins.redux).toMatchObject({ active: true });
  expect(rec.plugins.redux.highlights).toEqual(
    expect.arrayContaining(['wholeListStore: 1 change, most by favorites/toggle ×1', 'ownFlagStore: 1 change, most by favorites/toggle ×1'])
  );
});

/** Both tab sets fetch their first tab on the way in: a recording starts once it has come. */
const tabsLoaded = (page: Page) => async () => {
  for (const side of ['blocking', 'transition']) await expect(page.getByTestId(`tabs-${side}`).getByTestId('tab-panel')).toBeVisible();
};

const component = (rec: RecordingV2, name: string) => rec.components.find((c) => c.name === name);
const causesOf = (rec: RecordingV2, name: string) => (rec.roots.find((r) => r.name === name)?.causes ?? []).map(([key]) => key);

test('a child that tells its parent in an effect: a second commit, core:effect, the parent as its root', async ({ page }) => {
  const effect = 'core:effect @ src/basics/Notify.tsx';
  const broken = await record(page, '/basics/notify', async () => {
    for (const tag of ['bug', 'docs']) await page.getByTestId(`tag-effect-${tag}`).click();
    await page.waitForTimeout(200);
  });
  expect(broken.totals.commits).toBe(4);
  expect(broken.causes.find((c) => c.key === effect)?.commits).toBe(2);
  expect(causesOf(broken, 'FiltersByEffect')).toContain(effect);

  const fixed = await record(page, '/basics/notify', async () => {
    for (const tag of ['bug', 'docs']) await page.getByTestId(`tag-event-${tag}`).click();
    await page.waitForTimeout(200);
  });
  expect(fixed.totals.commits).toBe(2);
  expect(fixed.causes.map((c) => c.key)).not.toContain(effect);
});

test('an initial value passed as a call: the same renders, a much longer time', async ({ page }) => {
  const rec = await record(page, '/basics/init', async () => {
    for (let i = 0; i < 3; i++) await page.getByTestId('render').click();
  });
  const ms = (name: string) => rec.roots.find((r) => r.name === name)!.renderMs!;
  expect(rec.roots.find((r) => r.name === 'NotesEager')!.hits).toBe(rec.roots.find((r) => r.name === 'NotesLazy')!.hits);
  expect(ms('NotesEager')).toBeGreaterThan(ms('NotesLazy') * 2);
});

test('a draft restarted from an effect: two commits for a switch; set while rendering, one', async ({ page }) => {
  const rec = await record(page, '/basics/init', async () => {
    for (let i = 0; i < 2; i++) await page.getByTestId('next-user').click();
    await page.waitForTimeout(200);
  });
  expect(rec.causes.find((c) => c.key === 'core:effect @ src/basics/Init.tsx')?.commits).toBe(2);
  expect(rec.roots.find((r) => r.name === 'EditorByEffect')!.hits).toBe(4);
  expect(rec.roots.find((r) => r.name === 'EditorWhileRendering')!.hits).toBe(2);
});

test('a tab set straight away: the spinner mounts, the panel is the root of a Retry commit', async ({ page }) => {
  const rec = await record(
    page,
    '/advanced/suspense',
    async () => {
      await page.getByTestId('tab-blocking-activity').click();
      await expect(page.getByTestId('tabs-blocking').getByTestId('tab-panel')).toHaveAttribute('data-tab', 'activity');
      await page.waitForTimeout(100);
    },
    tabsLoaded(page)
  );
  // React 19 may render the suspended panel once more in a Retry lane of its own, before the data comes.
  expect(rec.totals.lanes).toMatchObject({ Sync: 1, Retry: expect.any(Number) });
  expect(component(rec, 'Spinner')?.mounts).toBe(1);
  expect(said(rec, 'TabPanel')).toContain('props: tab');
});

test('a tab set in a transition: no spinner, the panel comes in a Transition commit', async ({ page }) => {
  const rec = await record(
    page,
    '/advanced/suspense',
    async () => {
      await page.getByTestId('tab-transition-activity').click();
      await expect(page.getByTestId('tabs-transition').getByTestId('tab-panel')).toHaveAttribute('data-tab', 'activity');
      await page.waitForTimeout(100);
    },
    tabsLoaded(page)
  );
  expect(rec.totals.lanes.Transition).toBe(1);
  expect(component(rec, 'Spinner')).toBeUndefined();
  expect(said(rec, 'TabPanel')).toContain('parent: props tab');
});

test('a windowed log: twenty-odd renders for a switch, and a scroll is mounts, not renders', async ({ page }) => {
  const whole = await record(page, '/advanced/window', () => page.getByTestId('time-whole').check());
  expect(component(whole, 'Line')?.renders).toBe(10_000);

  const windowed = await record(page, '/advanced/window', () => page.getByTestId('time-window').check());
  expect(component(windowed, 'Line')?.renders).toBeLessThan(30);

  const scrolled = await record(page, '/advanced/window', async () => {
    await page.getByTestId('log-window').evaluate(async (el) => {
      for (let i = 0; i < 4; i++) {
        el.scrollTop += 200;
        await new Promise((resolve) => setTimeout(resolve, 80));
      }
    });
  });
  expect(component(scrolled, 'Line')).toMatchObject({ renders: 0 });
  expect(component(scrolled, 'Line')!.mounts).toBeGreaterThan(0);
  expect(scrolled.totals.rendersWithoutDom).toBe(0);
});

test('options from a prop getter: parent: props new ref, same content: onMouseEnter, onClick; with a compare, highlighted', async ({ page }) => {
  const move = (side: string) => async () => {
    const options = page.getByTestId(`option-${side}`);
    for (let i = 0; i < 4; i++) await options.nth(i).hover();
  };
  const props = await record(page, '/advanced/getters', move('props'));
  expect(said(props, 'OptionByProps')).toContain('parent: props new ref, same content: onMouseEnter, onClick');
  expect(component(props, 'OptionByProps')!.renders).toBe(48);

  const compare = await record(page, '/advanced/getters', move('compare'));
  // The memo with a compare function is one component, the app's own, counted when the compare lets it render.
  expect(component(compare, 'OptionByCompare')).toMatchObject({ renders: 7, withoutDom: 0, memo: true });
  expect(component(compare, 'OptionByCompare')!.library).toBeUndefined();
  expect(said(compare, 'OptionByCompare').every((text) => text.startsWith('parent: props highlighted'))).toBe(true);
});

import { expect, test, type Page } from '@playwright/test';
import type { RecorderGlobal } from '../../src/client';
import type { RecordingV2, RootStat } from '../../src/shared/schema';
import { hookOf, hookText, reasonTexts, reasonsById, type HookMode } from '../../src/shared/summary';
import type { Bug } from './fixture-app/src/bugs';

type Scenario = 'idle' | 'typing' | 'tabs';

const scenarios: Record<Scenario, (page: Page) => Promise<void>> = {
  idle: (page) => page.waitForTimeout(1500),
  typing: (page) => page.getByTestId('message').pressSequentially('12345', { delay: 60 }),
  tabs: async (page) => {
    for (let i = 0; i < 3; i++) {
      await page.getByTestId('tab-people').click();
      await page.getByTestId('tab-chat').click();
    }
  },
};

/** Runs the scenario on the fixture with the bug on or off and returns what the recorder saw. */
async function record(page: Page, scenario: Scenario, bugs: Bug | ''): Promise<RecordingV2> {
  await page.goto(bugs ? `/bug/${bugs}?tick=150` : `/app?tick=150`);
  await page.getByTestId('unread').waitFor();
  await page.waitForTimeout(300);
  // The page always has the recorder; its global is declared optional for pages without the plugin.
  await page.evaluate(() => (window.__REACT_PERF_RECORDER__ as RecorderGlobal).engine.start({ source: 'e2e', highlight: false }));
  await scenarios[scenario](page);
  return page.evaluate(() => (window.__REACT_PERF_RECORDER__ as RecorderGlobal).engine.stop());
}

const roots = (rec: RecordingV2) => [...rec.roots, ...rec.outsideRoots];
const rootsNamed = (rec: RecordingV2, name: string) => roots(rec).filter((r) => r.name === name);
const root = (rec: RecordingV2, name: string) => rootsNamed(rec, name)[0];
const reasons = (rec: RecordingV2, r: { reasons: Array<[number, number]> } | undefined) => (r ? reasonTexts(rec, r).map(([text]) => text) : []);
const causes = (r: RootStat | undefined) => (r?.causes ?? []).map(([key]) => key);
const component = (rec: RecordingV2, name: string) => rec.components.find((c) => c.name === name);
/** The hook chain behind the root's first reason, as the panel and the MCP server print it. */
const chain = (rec: RecordingV2, r: RootStat, mode: HookMode = 'full') => hookText(hookOf(r, reasonsById(rec.reasons).get(r.reasons[0][0])), mode);
const selector = (rec: RecordingV2, name: string) =>
  (rec.plugins['proxy-memoize'].data as { selectors: Array<{ name: string; evicting: boolean }> }).selectors.find((s) => s.name === name);

test('the clean chat is still the baseline after a tab has been open for a while', async ({ page }) => {
  // A fast clock: 45 messages arrive in about ten seconds, and a reaction lands every 25ms.
  await page.goto('/app?tick=5');
  await expect
    .poll(
      () =>
        page.locator('[data-testid^="message-m"]').evaluateAll((els) => Math.max(...els.map((e) => Number(e.getAttribute('data-testid')!.slice(9))))),
      { timeout: 20_000 }
    )
    .toBeGreaterThan(45);
  await page.evaluate(() => (window.__REACT_PERF_RECORDER__ as RecorderGlobal).engine.start({ source: 'e2e', highlight: false }));
  await page.waitForTimeout(1500);
  const rec: RecordingV2 = await page.evaluate(() => (window.__REACT_PERF_RECORDER__ as RecorderGlobal).engine.stop());
  expect(rec.totals.commits).toBeGreaterThan(20);
  expect(rec.totals.rendersWithoutDom).toBe(0);
  expect((rec.plugins['proxy-memoize'].data as { selectors: Array<{ evicting: boolean }> }).selectors.some((s) => s.evicting)).toBe(false);
});

/** Each test seeds one anti-pattern and checks the recording names it, and that a clean run does not. */
test.describe('seeded re-render bugs', () => {
  test('a component subscribed to a whole store object', async ({ page }) => {
    const rec = await record(page, 'idle', 'whole-object');
    const balance = root(rec, 'Unread');
    expect(balance.hits).toBeGreaterThan(3);
    expect(balance.noDomChange).toBe(balance.hits);
    expect(reasons(rec, balance)[0]).toBe('external store #2 [useChatStore] selectWorkspace');
    expect(chain(rec, balance)).toMatch(/^useWholeWorkspaceUnread › \[zustand\]/);
    expect(chain(rec, balance)).toContain('src/components/Header.tsx:');
    expect(causes(balance)).toContain('zustand:feed/tick');

    expect(root(await record(page, 'idle', ''), 'Unread')).toBeUndefined();
  });

  test('a live subscription where a value is only read at render time', async ({ page }) => {
    const rec = await record(page, 'idle', 'live-subscription');
    const amount = root(rec, 'MessageInput');
    expect(reasons(rec, amount)[0]).toMatch(/^external store #\d+ \[presenceStore\]/);
    expect(chain(rec, amount)).toMatch(/^useLivePresence › \[zustand\]/);
    // The price store, not the one the rest of the page listens to.
    expect(causes(amount)).toEqual(expect.arrayContaining(['zustand:presenceStore.setState']));
    expect(causes(amount)).not.toContain('zustand:feed/tick');

    expect(root(await record(page, 'idle', ''), 'MessageInput')).toBeUndefined();
  });

  test('fieldState renders a field on every errors event of the form', async ({ page }) => {
    const rec = await record(page, 'typing', 'field-state');
    const stops = rootsNamed(rec, 'MetaInput');
    expect(stops).toHaveLength(2);
    expect(reasons(rec, stops[0])[0]).toMatch(/^state #\d+$/);
    expect(chain(rec, stops[0])).toMatch(/^useMetaWithFieldState › \[react-hook-form\] useController/);
    expect(chain(rec, stops[0], 'short')).toMatch(/^useMetaWithFieldState › react-hook-form\.useController/);
    expect(causes(stops[0])).toContain('core:input input');
    expect(stops[0].noDomChange).toBe(stops[0].hits);

    expect(rootsNamed(await record(page, 'typing', ''), 'MetaInput')).toHaveLength(0);
  });

  test('watch() in the form root renders every field on every keystroke', async ({ page }) => {
    const rec = await record(page, 'typing', 'form-watch');
    const form = root(rec, 'Composer');
    expect(chain(rec, form)).toMatch(/^\[react-hook-form\] useForm/);
    expect(form.perHit).toBeGreaterThan(5);
    expect(reasons(rec, component(rec, 'MetaInput'))).toContain('parent: props equal');

    expect(root(await record(page, 'typing', ''), 'Composer')).toBeUndefined();
  });

  test('one memo slot shared by rows with different arguments', async ({ page }) => {
    const rec = await record(page, 'idle', 'memo-cache-slot');
    expect(selector(rec, 'selectMessageInfo')).toMatchObject({ evicting: true });
    expect(reasons(rec, root(rec, 'Status'))).toContainEqual(expect.stringContaining('SAME-CONTENT'));
    expect(rec.plugins['proxy-memoize'].highlights?.join(' ')).toContain('selectMessageInfo');

    const clean = await record(page, 'idle', '');
    // The clean rows keep a memoized selector each; none of them evicts.
    const rows = (clean.plugins['proxy-memoize'].data as { selectors: Array<{ name: string; evicting: boolean }> }).selectors;
    expect(rows.some((s) => s.evicting)).toBe(false);
    // Unnamed, they go by where they were made: one entry for all the rows.
    expect(rows.filter((s) => /^memoize in .*Messages\.tsx$/.test(s.name))).toHaveLength(1);
    expect(reasons(clean, root(clean, 'Status'))).not.toContainEqual(expect.stringContaining('SAME-CONTENT'));
  });

  test('a selector that builds a new array on every call', async ({ page }) => {
    const rec = await record(page, 'idle', 'new-array-selector');
    const table = root(rec, 'MessageList');
    expect(reasons(rec, table)[0]).toBe('external store #2 SAME-CONTENT [useChatStore] selectFreshIds');
    expect(chain(rec, table)).toContain('src/components/Messages.tsx:');

    expect(root(await record(page, 'idle', ''), 'MessageList')).toBeUndefined();
  });

  test('a JSX element built in render defeats memo', async ({ page }) => {
    const rec = await record(page, 'typing', 'inline-jsx-prop');
    expect(reasons(rec, component(rec, 'StatRow'))).toContain('parent: props new ref, same content: title');

    const clean = await record(page, 'typing', '');
    expect(reasons(clean, component(clean, 'StatRow'))).not.toContain('parent: props new ref, same content: title');
  });

  test('a context value built inline in a provider that renders often', async ({ page }) => {
    const rec = await record(page, 'idle', 'inline-context');
    const badge = root(rec, 'TimezoneBadge');
    expect(reasons(rec, badge)[0]).toBe('context SettingsContext SAME-CONTENT');
    expect(chain(rec, badge)).toMatch(/^useSettings › Context @ src\/components\/Settings\.tsx:/);
    expect(badge.noDomChange).toBe(badge.hits);

    expect(root(await record(page, 'idle', ''), 'TimezoneBadge')).toBeUndefined();
  });

  test('a layout hook that reads the URL renders the page on every navigation', async ({ page }) => {
    const rec = await record(page, 'tabs', 'router-in-layout');
    const view = root(rec, 'ChatView');
    expect(reasons(rec, view)).toContain('context Location');
    expect(chain(rec, view)).toMatch(/^useLayoutWithParams › \[react-router-dom\] useSearchParams/);
    expect(causes(view)).toContain('core:navigation push');
    expect(view.perHit).toBeGreaterThan(root(rec, 'ChatPanel')?.perHit ?? 0);

    expect(root(await record(page, 'tabs', ''), 'ChatView')).toBeUndefined();
  });

  test('an exact value where only a rounded one is shown', async ({ page }) => {
    const rec = await record(page, 'idle', 'exact-value');
    // The message is minutes old, so its label does not move; the clock behind it does, every second.
    const time = root(rec, 'TimeAgo');
    expect(reasons(rec, time)[0]).toMatch(/^external store #\d+ \[clockStore\]/);
    // Three rows, so every commit is three renders — and not one of them changed a word on the screen.
    expect(time.noDomChange).toBe(time.cascade);
    expect(rec.totals.rendersWithoutDom).toBeGreaterThan(0);

    expect(root(await record(page, 'idle', ''), 'TimeAgo')).toBeUndefined();
  });

  test('a component declared inside a render is remounted every time', async ({ page }) => {
    const rec = await record(page, 'idle', 'nested-component');
    expect(root(rec, 'Status').mounts).toBeGreaterThan(0);
    expect(component(rec, 'NestedCount')).toMatchObject({ renders: 0 });
    expect(component(rec, 'NestedCount')!.mounts).toBeGreaterThan(0);
    expect(rec.dom.child).toBeGreaterThan(0);

    const clean = await record(page, 'idle', '');
    expect(clean.totals.mounts).toBe(0);
    expect(clean.dom.child ?? 0).toBe(0);
  });

  test('a custom hook keeping a ticking state its caller never shows', async ({ page }) => {
    const rec = await record(page, 'idle', 'hidden-hook-state');
    const badge = root(rec, 'TypingBadge');
    expect(reasons(rec, badge)[0]).toBe('state #0');
    expect(chain(rec, badge)).toMatch(/^useTypingByClock › useNow › State @ src\/components\/TypingBadge\.tsx:/);
    expect(badge.noDomChange).toBe(badge.hits);
    // The timer is named, and it is what explains this component; a feed tick landing in the same commit window
    // may join the list, which is why this asks what leads it rather than what the whole list is.
    const timer = 'core:timer setInterval @ src/components/TypingBadge.tsx';
    expect(causes(badge)[0]).toBe(timer);
    // And it is aimed: no other component is blamed for that timer.
    expect(
      roots(rec)
        .filter((r) => causes(r).includes(timer))
        .map((r) => r.name)
    ).toEqual(['TypingBadge']);

    expect(root(await record(page, 'idle', ''), 'TypingBadge')).toBeUndefined();
  });

  test('state copied from props in an effect costs a second commit', async ({ page }) => {
    const rec = await record(page, 'tabs', 'effect-derived-state');
    const clean = await record(page, 'tabs', '');
    const hits = (r: RecordingV2) => root(r, 'ChatPanel').hits;
    expect(hits(rec)).toBeGreaterThan(hits(clean));
    expect(root(rec, 'ChatPanel').noDomChange).toBeGreaterThan(0);
    // Nothing else explains the second commit, so the cause names the effect that asked for it.
    expect(causes(root(rec, 'ChatPanel'))).toContain('core:effect @ src/components/ChatPanel.tsx');
    expect(rec.causes.find((c) => c.key === 'core:effect @ src/components/ChatPanel.tsx')!.commits).toBeGreaterThan(1);
  });

  test('the report keeps the app’s components apart from the packages’', async ({ page }) => {
    const rec = await record(page, 'tabs', '');
    expect(component(rec, 'MessageRow')).not.toHaveProperty('library');
    expect(component(rec, 'RenderedRoute')).toMatchObject({ library: true });
    // The app's own come first, whatever a package renders more often.
    const first = rec.components.findIndex((c) => c.library);
    expect(rec.components.slice(0, first).every((c) => !c.library)).toBe(true);
  });

  test('the price feed and the poll are named as the causes of the quiet page', async ({ page }) => {
    const rec = await record(page, 'idle', '');
    const keys = rec.causes.map((c) => c.key);
    expect(keys).toEqual(expect.arrayContaining(['zustand:feed/tick', 'zustand:presenceStore.setState', 'core:message Worker']));
    // A poll is one cause, on the commits of its own subscribers: not three, and not on a feed tick's commit.
    const poll = rec.causes.find((c) => c.key === 'react-query:fetch → success ["presence"]')!;
    expect(poll).toBeDefined();
    // react-query's timer stands alone only when the poll it delivers began before the recording did.
    const timer = rec.causes.find((c) => c.key.includes('@tanstack'));
    const firstPoll = Math.min(...rec.commits.list.filter((c) => c.causeIds?.includes(poll.i)).map((c) => c.i));
    expect(rec.commits.list.filter((c) => timer && c.causeIds?.includes(timer.i) && c.i > firstPoll)).toEqual([]);
    const pollRoots = rec.commits.list.filter((c) => c.causeIds?.includes(poll.i)).flatMap((c) => (c.roots ?? []).map((r) => rec.roots[r.i].name));
    expect(new Set(pollRoots)).toEqual(new Set(['ChannelStats']));
    // Every commit is explained: nothing falls through to "no known cause".
    expect(keys).not.toContain('core:none');
    // And the other way round: most feed ticks wake nobody, so their events are dropped instead of counted.
    expect(rec.totals.causesDropped).toBeGreaterThan(0);
  });
});

/** What the recording says about the person's own doing, beyond «a click happened somewhere». */
test('an action names the element it landed on and the commits it caused', async ({ page }) => {
  await page.goto('/basics/keys?tick=150');
  await page.getByTestId('prepend').first().waitFor();
  await page.evaluate(() => (window.__REACT_PERF_RECORDER__ as RecorderGlobal).engine.start({ source: 'e2e', highlight: false }));
  await page.getByTestId('prepend').first().click();
  // The same row exists in the broken list and in the fixed one; the record has to say which was clicked.
  await page.getByTestId('task-t1').nth(1).click();
  await page.waitForTimeout(150);
  const rec: RecordingV2 = await page.evaluate(() => (window.__REACT_PERF_RECORDER__ as RecorderGlobal).engine.stop());

  const click = rec.actions.find((a) => a.target?.testId === 'prepend')!;
  expect(click.target).toMatchObject({ tag: 'button', testId: 'prepend', selector: '[data-testid="prepend"]', text: 'Add at the top' });
  expect(click.target?.component).toBeTruthy();
  expect(click.target?.source).toMatch(/^src\/basics\/Keys\.tsx:\d+$/);
  expect(click.target?.path?.length).toBeGreaterThan(0);
  expect(click.target?.point).toEqual(expect.objectContaining({ x: expect.any(Number), y: expect.any(Number) }));
  expect(click.target?.box?.w).toBeGreaterThan(0);
  // And what it led to, by id, so a timeline can draw the line between them.
  expect(click.commitIds?.length).toBeGreaterThan(0);
  const commit = rec.commits.list[click.commitIds![0]];
  expect(commit.actionId).toBe(click.id);
  expect(commit.roots?.[0]?.reasonIds.length).toBeGreaterThan(0);
  expect(rec.reasons[commit.roots![0].reasonIds[0]].kind).toBeTruthy();

  const row = rec.actions.find((a) => a.target?.testId === 'task-t1')!;
  expect(row.target).toMatchObject({ selector: '[data-testid="task-t1"]', nth: 1 });
});

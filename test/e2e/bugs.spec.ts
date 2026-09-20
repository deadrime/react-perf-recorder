import { expect, test, type Page } from '@playwright/test';
import type { RecorderGlobal } from '../../src/client';
import type { RecordingV1, RootStat } from '../../src/shared/schema';
import { hookOf, hookText, type HookMode } from '../../src/shared/summary';
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
async function record(page: Page, scenario: Scenario, bugs: Bug | ''): Promise<RecordingV1> {
  await page.goto(bugs ? `/bug/${bugs}?tick=150` : `/app?tick=150`);
  await page.getByTestId('unread').waitFor();
  await page.waitForTimeout(300);
  // The page always has the recorder; its global is declared optional for pages without the plugin.
  await page.evaluate(() => (window.__REACT_PERF_RECORDER__ as RecorderGlobal).engine.start({ source: 'e2e', highlight: false }));
  await scenarios[scenario](page);
  return page.evaluate(() => (window.__REACT_PERF_RECORDER__ as RecorderGlobal).engine.stop());
}

const roots = (rec: RecordingV1) => [...rec.roots, ...rec.outsideRoots];
const rootsNamed = (rec: RecordingV1, name: string) => roots(rec).filter((r) => r.name === name);
const root = (rec: RecordingV1, name: string) => rootsNamed(rec, name)[0];
const reasons = (r: RootStat | undefined) => (r?.reasons ?? []).map(([text]) => text);
const causes = (r: RootStat | undefined) => (r?.causes ?? []).map(([key]) => key);
const component = (rec: RecordingV1, name: string) => rec.components.find((c) => c.name === name);
/** The hook chain behind the root's first reason, as the panel and the MCP server print it. */
const chain = (r: RootStat, mode: HookMode = 'full') => hookText(hookOf(r, r.reasons[0][0]), mode);
const selector = (rec: RecordingV1, name: string) =>
  (rec.plugins['proxy-memoize'].data as { selectors: Array<{ name: string; thrash: boolean }> }).selectors.find((s) => s.name === name);

/** Each test seeds one anti-pattern and checks the recording names it, and that a clean run does not. */
test.describe('seeded re-render bugs', () => {
  test('a component subscribed to a whole store object', async ({ page }) => {
    const rec = await record(page, 'idle', 'whole-object');
    const balance = root(rec, 'Unread');
    expect(balance.hits).toBeGreaterThan(3);
    expect(balance.noDomChange).toBe(balance.hits);
    expect(reasons(balance)[0]).toBe('external store #2 [useChatStore] selectWorkspace');
    expect(chain(balance)).toMatch(/^useWholeWorkspaceUnread › \[zustand\]/);
    expect(chain(balance)).toContain('src/components/Header.tsx:');
    expect(causes(balance)).toContain('zustand:feed/tick');

    expect(root(await record(page, 'idle', ''), 'Unread')).toBeUndefined();
  });

  test('a live subscription where a value is only read at render time', async ({ page }) => {
    const rec = await record(page, 'idle', 'live-subscription');
    const amount = root(rec, 'MessageInput');
    expect(reasons(amount)[0]).toMatch(/^external store #\d+ \[presenceStore\]/);
    expect(chain(amount)).toMatch(/^useLivePresence › \[zustand\]/);
    // The price store, not the one the rest of the page listens to.
    expect(causes(amount)).toEqual(expect.arrayContaining(['zustand:presenceStore.setState']));
    expect(causes(amount)).not.toContain('zustand:feed/tick');

    expect(root(await record(page, 'idle', ''), 'MessageInput')).toBeUndefined();
  });

  test('fieldState renders a field on every errors event of the form', async ({ page }) => {
    const rec = await record(page, 'typing', 'field-state');
    const stops = rootsNamed(rec, 'MetaInput');
    expect(stops).toHaveLength(2);
    expect(reasons(stops[0])[0]).toMatch(/^state #\d+$/);
    expect(chain(stops[0])).toMatch(/^useMetaWithFieldState › \[react-hook-form\] useController/);
    expect(chain(stops[0], 'short')).toMatch(/^useMetaWithFieldState › react-hook-form\.useController/);
    expect(causes(stops[0])).toContain('core:input input');
    expect(stops[0].noDomChange).toBe(stops[0].hits);

    expect(rootsNamed(await record(page, 'typing', ''), 'MetaInput')).toHaveLength(0);
  });

  test('watch() in the form root renders every field on every keystroke', async ({ page }) => {
    const rec = await record(page, 'typing', 'form-watch');
    const form = root(rec, 'Composer');
    expect(chain(form)).toMatch(/^\[react-hook-form\] useForm/);
    expect(form.perHit).toBeGreaterThan(5);
    expect(component(rec, 'MetaInput')?.reasons.map(([text]) => text)).toContain('parent: props equal');

    expect(root(await record(page, 'typing', ''), 'Composer')).toBeUndefined();
  });

  test('one memo slot shared by rows with different arguments', async ({ page }) => {
    const rec = await record(page, 'idle', 'memo-cache-slot');
    expect(selector(rec, 'selectMessageInfo')).toMatchObject({ thrash: true });
    expect(reasons(root(rec, 'Status'))).toContainEqual(expect.stringContaining('SAME-CONTENT'));
    expect(rec.plugins['proxy-memoize'].highlights?.join(' ')).toContain('selectMessageInfo');

    const clean = await record(page, 'idle', '');
    expect(selector(clean, 'selectMessageInfo')).toMatchObject({ thrash: false });
    expect(reasons(root(clean, 'Status'))).not.toContainEqual(expect.stringContaining('SAME-CONTENT'));
  });

  test('a selector that builds a new array on every call', async ({ page }) => {
    const rec = await record(page, 'idle', 'new-array-selector');
    const table = root(rec, 'MessageList');
    expect(reasons(table)[0]).toBe('external store #2 SAME-CONTENT [useChatStore] selectFreshIds');
    expect(chain(table)).toContain('src/components/Messages.tsx:');

    expect(root(await record(page, 'idle', ''), 'MessageList')).toBeUndefined();
  });

  test('a JSX element built in render defeats memo', async ({ page }) => {
    const rec = await record(page, 'typing', 'inline-jsx-prop');
    expect(component(rec, 'StatRow')?.reasons.map(([text]) => text)).toContain('parent: props same: title');

    const clean = await record(page, 'typing', '');
    expect(component(clean, 'StatRow')?.reasons.map(([text]) => text)).not.toContain('parent: props same: title');
  });

  test('a context value built inline in a provider that renders often', async ({ page }) => {
    const rec = await record(page, 'idle', 'inline-context');
    const badge = root(rec, 'TimezoneBadge');
    expect(reasons(badge)[0]).toBe('context SettingsContext SAME-CONTENT');
    expect(chain(badge)).toMatch(/^useSettings › Context @ src\/components\/Settings\.tsx:/);
    expect(badge.noDomChange).toBe(badge.hits);

    expect(root(await record(page, 'idle', ''), 'TimezoneBadge')).toBeUndefined();
  });

  test('a layout hook that reads the URL renders the page on every navigation', async ({ page }) => {
    const rec = await record(page, 'tabs', 'router-in-layout');
    const view = root(rec, 'ChatView');
    expect(reasons(view)).toContain('context Location');
    expect(chain(view)).toMatch(/^useLayoutWithParams › \[react-router-dom\] useSearchParams/);
    expect(causes(view)).toContain('core:navigation push');
    expect(view.perHit).toBeGreaterThan(root(rec, 'ChatPanel')?.perHit ?? 0);

    expect(root(await record(page, 'tabs', ''), 'ChatView')).toBeUndefined();
  });

  test('an exact value where only a rounded one is shown', async ({ page }) => {
    const rec = await record(page, 'idle', 'exact-value');
    // The message is minutes old, so its label does not move; the clock behind it does, every second.
    const time = root(rec, 'TimeAgo');
    expect(reasons(time)[0]).toMatch(/^external store #\d+ \[clockStore\]/);
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
    expect(reasons(badge)[0]).toBe('state #0');
    expect(chain(badge)).toMatch(/^useTypingByClock › useNow › State @ src\/components\/TypingBadge\.tsx:/);
    expect(badge.noDomChange).toBe(badge.hits);
    // The timer is named, and only the component it updated gets it.
    expect(causes(badge)).toEqual(['core:timer setInterval @ src/components/TypingBadge.tsx']);

    expect(root(await record(page, 'idle', ''), 'TypingBadge')).toBeUndefined();
  });

  test('state copied from props in an effect costs a second commit', async ({ page }) => {
    const rec = await record(page, 'tabs', 'effect-derived-state');
    const clean = await record(page, 'tabs', '');
    const hits = (r: RecordingV1) => root(r, 'ChatPanel').hits;
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
    expect(keys).toEqual(
      expect.arrayContaining([
        'zustand:feed/tick',
        'zustand:presenceStore.setState',
        'core:message Worker',
      ])
    );
    expect(keys.some((k) => k.startsWith('react-query:'))).toBe(true);
    // Every commit is explained: nothing falls through to "no known cause".
    expect(keys).not.toContain('core:none');
    // And the other way round: most feed ticks wake nobody, so their events are dropped instead of counted.
    expect(rec.totals.causesDropped).toBeGreaterThan(0);
  });
});

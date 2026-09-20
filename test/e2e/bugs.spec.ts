import { expect, test, type Page } from '@playwright/test';
import type { RecorderGlobal } from '../../src/client';
import type { RecordingV1, RootStat } from '../../src/shared/schema';
import { hookOf, hookText, type HookMode } from '../../src/shared/summary';
import type { Bug } from './fixture-app/src/bugs';

type Scenario = 'idle' | 'typing' | 'tabs';

const scenarios: Record<Scenario, (page: Page) => Promise<void>> = {
  idle: (page) => page.waitForTimeout(1500),
  typing: (page) => page.getByTestId('amount').pressSequentially('12345', { delay: 60 }),
  tabs: async (page) => {
    for (let i = 0; i < 3; i++) {
      await page.getByTestId('tab-orders').click();
      await page.getByTestId('tab-positions').click();
    }
  },
};

/** Runs the scenario on the fixture with the bug on or off and returns what the recorder saw. */
async function record(page: Page, scenario: Scenario, bugs: Bug | ''): Promise<RecordingV1> {
  await page.goto(`/?tick=150&bugs=${bugs}`);
  await page.getByTestId('balance').waitFor();
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
    const balance = root(rec, 'Balance');
    expect(balance.hits).toBeGreaterThan(3);
    expect(balance.noDomChange).toBe(balance.hits);
    expect(reasons(balance)[0]).toBe('external store #2 [useTerminalStore] selectAccount');
    expect(chain(balance)).toMatch(/^useWholeAccountBalance › \[zustand\]/);
    expect(chain(balance)).toContain('src/components/Header.tsx:');
    expect(causes(balance)).toContain('zustand:markets/tick');

    expect(root(await record(page, 'idle', ''), 'Balance')).toBeUndefined();
  });

  test('a live subscription where a value is only read at render time', async ({ page }) => {
    const rec = await record(page, 'idle', 'live-subscription');
    const amount = root(rec, 'AmountInput');
    expect(reasons(amount)[0]).toMatch(/^external store #\d+ \[priceStore\]/);
    expect(chain(amount)).toMatch(/^useLiveTrade › \[zustand\]/);
    // The price store, not the one the rest of the page listens to.
    expect(causes(amount)).toEqual(expect.arrayContaining(['zustand:priceStore.setState']));
    expect(causes(amount)).not.toContain('zustand:markets/tick');

    expect(root(await record(page, 'idle', ''), 'AmountInput')).toBeUndefined();
  });

  test('fieldState renders a field on every errors event of the form', async ({ page }) => {
    const rec = await record(page, 'typing', 'field-state');
    const stops = rootsNamed(rec, 'StopInput');
    expect(stops).toHaveLength(2);
    expect(reasons(stops[0])[0]).toMatch(/^state #\d+$/);
    expect(chain(stops[0])).toMatch(/^useStopWithFieldState › \[react-hook-form\] useController/);
    expect(chain(stops[0], 'short')).toMatch(/^useStopWithFieldState › react-hook-form\.useController/);
    expect(causes(stops[0])).toContain('core:input input');
    expect(stops[0].noDomChange).toBe(stops[0].hits);

    expect(rootsNamed(await record(page, 'typing', ''), 'StopInput')).toHaveLength(0);
  });

  test('watch() in the form root renders every field on every keystroke', async ({ page }) => {
    const rec = await record(page, 'typing', 'form-watch');
    const form = root(rec, 'OrderForm');
    expect(chain(form)).toMatch(/^\[react-hook-form\] useForm/);
    expect(form.perHit).toBeGreaterThan(5);
    expect(component(rec, 'StopInput')?.reasons.map(([text]) => text)).toContain('parent: props equal');

    expect(root(await record(page, 'typing', ''), 'OrderForm')).toBeUndefined();
  });

  test('one memo slot shared by rows with different arguments', async ({ page }) => {
    const rec = await record(page, 'idle', 'memo-cache-slot');
    expect(selector(rec, 'selectPositionInfo')).toMatchObject({ thrash: true });
    expect(reasons(root(rec, 'PositionRow'))).toContainEqual(expect.stringContaining('SAME-CONTENT'));
    expect(rec.plugins['proxy-memoize'].highlights?.join(' ')).toContain('selectPositionInfo');

    const clean = await record(page, 'idle', '');
    expect(selector(clean, 'selectPositionInfo')).toMatchObject({ thrash: false });
    expect(reasons(root(clean, 'PositionRow'))).not.toContainEqual(expect.stringContaining('SAME-CONTENT'));
  });

  test('a selector that builds a new array on every call', async ({ page }) => {
    const rec = await record(page, 'idle', 'new-array-selector');
    const table = root(rec, 'PositionTable');
    expect(reasons(table)[0]).toBe('external store #2 SAME-CONTENT [useTerminalStore] selectFreshIds');
    expect(chain(table)).toContain('src/components/Positions.tsx:');

    expect(root(await record(page, 'idle', ''), 'PositionTable')).toBeUndefined();
  });

  test('a JSX element built in render defeats memo', async ({ page }) => {
    const rec = await record(page, 'typing', 'inline-jsx-prop');
    expect(component(rec, 'ChangeRow')?.reasons.map(([text]) => text)).toContain('parent: props same: title');

    const clean = await record(page, 'typing', '');
    expect(component(clean, 'ChangeRow')?.reasons.map(([text]) => text)).not.toContain('parent: props same: title');
  });

  test('a context value built inline in a provider that renders often', async ({ page }) => {
    const rec = await record(page, 'idle', 'inline-context');
    const badge = root(rec, 'CurrencyBadge');
    expect(reasons(badge)[0]).toBe('context SettingsContext SAME-CONTENT');
    expect(chain(badge)).toMatch(/^useSettings › Context @ src\/components\/Settings\.tsx:/);
    expect(badge.noDomChange).toBe(badge.hits);

    expect(root(await record(page, 'idle', ''), 'CurrencyBadge')).toBeUndefined();
  });

  test('a layout hook that reads the URL renders the page on every navigation', async ({ page }) => {
    const rec = await record(page, 'tabs', 'router-in-layout');
    const view = root(rec, 'TradeView');
    expect(reasons(view)).toContain('context Location');
    expect(chain(view)).toMatch(/^useLayoutWithParams › \[react-router-dom\] useSearchParams/);
    expect(causes(view)).toContain('core:navigation push');
    expect(view.perHit).toBeGreaterThan(root(rec, 'OrdersPanel')?.perHit ?? 0);

    expect(root(await record(page, 'tabs', ''), 'TradeView')).toBeUndefined();
  });

  test('an exact value where only a rounded one is shown', async ({ page }) => {
    const rec = await record(page, 'idle', 'exact-value');
    const bar = root(rec, 'HealthBar');
    expect(reasons(bar)[0]).toBe('external store #2 [useTerminalStore] selectHealth');
    expect(bar.noDomChange).toBe(bar.hits);
    expect(rec.totals.rendersWithoutDom).toBeGreaterThan(0);

    expect(root(await record(page, 'idle', ''), 'HealthBar')).toBeUndefined();
  });

  test('a component declared inside a render is remounted every time', async ({ page }) => {
    const rec = await record(page, 'idle', 'nested-component');
    expect(root(rec, 'PositionRow').mounts).toBeGreaterThan(0);
    expect(component(rec, 'NestedPnl')).toMatchObject({ renders: 0 });
    expect(component(rec, 'NestedPnl')!.mounts).toBeGreaterThan(0);
    expect(rec.dom.child).toBeGreaterThan(0);

    const clean = await record(page, 'idle', '');
    expect(clean.totals.mounts).toBe(0);
    expect(clean.dom.child ?? 0).toBe(0);
  });

  test('a custom hook keeping a ticking state its caller never shows', async ({ page }) => {
    const rec = await record(page, 'idle', 'hidden-hook-state');
    const badge = root(rec, 'FundingBadge');
    expect(reasons(badge)[0]).toBe('state #0');
    expect(chain(badge)).toMatch(/^useFundingSoonByClock › useNow › State @ src\/components\/FundingBadge\.tsx:/);
    expect(badge.noDomChange).toBe(badge.hits);
    // The timer is named, and only the component it updated gets it.
    expect(causes(badge)).toEqual(['core:timer setInterval @ src/components/FundingBadge.tsx']);
    expect(causes(root(rec, 'FundingCountdown'))).toEqual(['core:timer setInterval @ src/components/FundingCountdown.tsx']);

    expect(root(await record(page, 'idle', ''), 'FundingBadge')).toBeUndefined();
  });

  test('state copied from props in an effect costs a second commit', async ({ page }) => {
    const rec = await record(page, 'tabs', 'effect-derived-state');
    const clean = await record(page, 'tabs', '');
    const hits = (r: RecordingV1) => root(r, 'OrdersPanel').hits;
    expect(hits(rec)).toBeGreaterThan(hits(clean));
    expect(root(rec, 'OrdersPanel').noDomChange).toBeGreaterThan(0);
    // Nothing else explains the second commit, so the cause names the effect that asked for it.
    expect(causes(root(rec, 'OrdersPanel'))).toContain('core:effect @ src/components/OrdersPanel.tsx');
    expect(rec.causes.find((c) => c.key === 'core:effect @ src/components/OrdersPanel.tsx')!.commits).toBeGreaterThan(1);
  });

  test('the report keeps the app’s components apart from the packages’', async ({ page }) => {
    const rec = await record(page, 'tabs', '');
    expect(component(rec, 'PositionRow')).not.toHaveProperty('library');
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
        'zustand:markets/tick',
        'zustand:priceStore.setState',
        'core:message Worker',
        'core:timer setInterval @ src/components/FundingCountdown.tsx',
      ])
    );
    expect(keys.some((k) => k.startsWith('react-query:'))).toBe(true);
    // Every commit is explained: nothing falls through to "no known cause".
    expect(keys).not.toContain('core:none');
    expect(rec.totals.causesDropped).toBe(0);
  });
});

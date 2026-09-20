import fs from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import type { RecordingV1, SessionMeta } from '../../src/shared/schema';
import { SESSIONS_DIR } from '../../playwright.config';

test.use({ permissions: ['clipboard-read', 'clipboard-write'] });

const sessions = () => (fs.existsSync(SESSIONS_DIR) ? fs.readdirSync(SESSIONS_DIR).filter((d) => /^\d{8}-/.test(d)) : []);

async function newRecording(before: string[]): Promise<{ meta: SessionMeta; recording: RecordingV1 }> {
  let id: string | undefined;
  await expect
    .poll(() => {
      id = sessions().find((d) => !before.includes(d) && fs.existsSync(path.join(SESSIONS_DIR, d, 'recording.json')));
      return id;
    })
    .toBeTruthy();
  const dir = path.join(SESSIONS_DIR, id!);
  return {
    meta: JSON.parse(fs.readFileSync(path.join(dir, 'session.json'), 'utf8')),
    recording: JSON.parse(fs.readFileSync(path.join(dir, 'recording.json'), 'utf8')),
  };
}

const open = async (page: Page) => {
  await page.goto('/?rpr=panel&tick=150');
  await expect(page.getByTestId('balance')).toBeVisible();
  await page.locator('[data-rpr="toggle"]').click();
};

const tree = (page: Page) => page.locator('[data-rpr="tree"] li');
/** Pixels drawn on the highlight canvas; the overlay lives in the panel's shadow root. */
const painted = (page: Page) =>
  page.evaluate(() => {
    const canvas = document.querySelector('[data-react-perf-recorder]')?.shadowRoot?.querySelector('canvas');
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return false;
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    for (let i = 3; i < data.length; i += 4) if (data[i]) return true;
    return false;
  });

test('records a session from the panel with a note, store causes, hook names and masked input', async ({ page }) => {
  const before = sessions();
  await open(page);
  await page.locator('[data-rpr="note"]').fill('typing the key label');
  await page.locator('[data-rpr="record"]').click();
  await page.getByTestId('key-label').pressSequentially('main');
  await page.getByTestId('key-secret').pressSequentially('s3cret');
  await page.getByTestId('close-p3').click();
  await page.locator('[data-rpr="stop"]').click();
  await expect(page.locator('[data-rpr="result"]')).toContainText('saved');
  const { meta, recording } = await newRecording(before);

  expect(meta).toMatchObject({ status: 'done', label: 'typing the key label' });
  const row = recording.roots.find((r) => r.name === 'PositionRow')!;
  const storeReason = row.reasons.find(([text]) => text.startsWith('external store'))![0];
  expect(storeReason).toMatch(/^external store #\d+ \[useTerminalStore\]/);
  const hook = row.hooks![/#(\d+)/.exec(storeReason)![1]];
  expect(hook.path).toEqual(['usePositionInfo', 'useBoundStore', 'useStore', 'useSyncExternalStoreWithSelector', 'SyncExternalStore']);
  expect(hook).toMatchObject({ library: 'zustand', libraryAt: 1 });
  // The call site in the component: the line where it calls the outermost custom hook.
  expect(hook.site).toMatch(/^src\/components\/Positions\.tsx:\d+$/);
  expect(hook.code).toBe('const info = usePositionInfo(id);');
  expect(recording.causes.map((c) => c.key)).toEqual(expect.arrayContaining(['zustand:markets/tick', 'zustand:positions/close']));

  const typing = recording.actions.filter((a) => a.kind === 'typing');
  expect(typing.find((a) => a.target?.name === 'label')).toMatchObject({ chars: 4, length: 4 });
  expect(typing.find((a) => a.target?.name === 'label')).not.toHaveProperty('value');
  expect(typing.find((a) => a.target?.name === 'secret')).toMatchObject({ secret: true });
  expect(typing.find((a) => a.target?.name === 'secret')).not.toHaveProperty('length');
  const click = recording.actions.find((a) => a.kind === 'click' && a.target?.testId === 'close-p3')!;
  expect(recording.segments.find((s) => s.action === click.id)!.reaction.commits).toBeGreaterThan(0);

  expect(recording.plugins.zustand.highlights?.join(' ')).toContain('useTerminalStore');
  expect(Object.keys(recording.plugins)).toEqual(expect.arrayContaining(['zustand', 'proxy-memoize', 'react-query']));
});

test('picks an area from the tree: parents above, components inside, and the area stays editable', async ({ page }) => {
  const before = sessions();
  await open(page);
  await page.locator('[data-rpr="pick"]').click();
  await page.getByTestId('position-p1').hover();
  await page.getByTestId('position-p1').click();
  // The path from the app root down to the row, the row active.
  await expect(tree(page).first()).toHaveAttribute('data-name', 'QueryClientProvider');
  await expect(tree(page).locator('[data-active="true"]')).toHaveCount(0);
  await expect(page.locator('[data-rpr="tree"] li[data-name="PositionRow"]')).toHaveAttribute('data-active', 'true');
  // Right opens what is inside the row.
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('[data-rpr="tree"] li[data-name="Pnl"]')).toBeVisible();
  await page.locator('[data-rpr="tree"] li[data-name="Pnl"]').click();
  await expect(page.locator('[data-rpr="scope"]')).toHaveText('Pnl');

  // Clicking the area name reopens the tree on it; ← goes back to the parent, Enter confirms it.
  await page.locator('[data-rpr="scope"]').click();
  await expect(page.locator('[data-rpr="tree"] li[data-name="Pnl"]')).toHaveAttribute('data-active', 'true');
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-rpr="scope"]')).toHaveText('PositionRow');

  await page.locator('[data-rpr="record"]').click();
  await page.waitForTimeout(800);
  await page.locator('[data-rpr="stop"]').click();
  const { recording } = await newRecording(before);
  expect(recording.scope).toMatchObject({ name: 'PositionRow', state: 'attached' });
  // The row renders from its own subscription; its children are inside the area, the rest of the page is not.
  expect(recording.roots.map((r) => r.name)).toContain('PositionRow');
  expect(recording.components.map((c) => c.name)).toContain('Pnl');
  expect(recording.components.map((c) => c.name)).not.toContain('ConnectionStatus');
});

test('follows a component picked in the tree and shows the leading roots live', async ({ page }) => {
  const before = sessions();
  await open(page);
  await page.locator('[data-rpr="pick"]').click();
  await page.getByTestId('position-p1').click();
  await page.locator('[data-rpr="tree"] li[data-name="PositionRow"] [data-rpr="watch-toggle"]').click();
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-rpr="watch"] [data-name="PositionRow"]')).toBeVisible();

  await page.locator('[data-rpr="record"]').click();
  // While it records, the panel names the roots leading so far.
  await expect(page.locator('[data-rpr="live-roots"]')).toContainText('PositionRow');
  await expect(page.locator('[data-rpr="live-roots"]')).toContainText('external store');
  await page.locator('[data-rpr="stop"]').click();
  const { recording } = await newRecording(before);
  expect(recording.watch?.PositionRow.renders).toBeGreaterThan(0);
  expect(recording.watch?.PositionRow.mounted).toBe(3);
  await expect(page.locator('[data-rpr="result"]')).toContainText('Watched');

  // The chip removes it again.
  await page.locator('[data-rpr="watch"] [data-name="PositionRow"]').click();
  await expect(page.locator('[data-rpr="watch"] [data-name="PositionRow"]')).toHaveCount(0);
});

test('copies the area for an assistant', async ({ page }) => {
  await open(page);
  await page.locator('[data-rpr="pick"]').click();
  await page.getByTestId('position-p1').click();
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-rpr="scope"]')).toHaveText('PositionRow');
  await page.locator('[data-rpr="copy-scope"]').click();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toContain('Component: PositionRow — src/components/Positions.tsx:');
  expect(copied).toContain('› PositionTable › PositionRow');
  expect(copied).toContain('Element: <tr data-testid="position-p1"');
  expect(copied).toContain('Inside: Pnl');
  expect(copied).toContain('react-perf-recorder scope: {"names":');
});

test('outlines renders inside the area while nothing is recorded, and marks recordings made with it', async ({ page }) => {
  const before = sessions();
  await open(page);
  await page.locator('input[data-rpr="highlight"]').check();
  await page.locator('[data-rpr="pick"]').click();
  await page.getByTestId('positions').click();
  await page.locator('[data-rpr="tree"] li[data-name="PositionTable"]').click();
  await expect(page.locator('[data-rpr="scope"]')).toHaveText('PositionTable');
  await expect.poll(() => painted(page)).toBe(true);

  await page.locator('[data-rpr="record"]').click();
  await page.waitForTimeout(600);
  await page.locator('[data-rpr="stop"]').click();
  const { recording } = await newRecording(before);
  expect(recording.overhead.highlight).toBe(true);
  expect(recording.warnings.some((w) => w.startsWith('highlight was on'))).toBe(true);

  await page.locator('input[data-rpr="highlight"]').uncheck();
  await expect.poll(() => painted(page)).toBe(false);
});

test('the shortcut opens the panel and records', async ({ page }) => {
  const before = sessions();
  await page.goto('/?tick=150');
  await expect(page.getByTestId('balance')).toBeVisible();
  await expect(page.locator('[data-rpr="record"]')).toBeHidden();
  await page.keyboard.press('Alt+Shift+KeyR');
  await page.getByTestId('tab-orders').click();
  await page.keyboard.press('Alt+Shift+KeyR');
  const { recording } = await newRecording(before);
  expect(recording.tool.source).toBe('panel');
  expect(recording.totals.commitsInScope).toBeGreaterThan(0);
  await expect(page.locator('[data-rpr="record"]')).toBeVisible();
});

test('records the page load: the panel reloads into a recording', async ({ page }) => {
  const before = sessions();
  await open(page);
  await page.locator('[data-rpr="note"]').fill('what the load costs');
  await page.locator('[data-rpr="record-on-load"]').click();
  await expect(page.getByTestId('balance')).toBeVisible();
  await expect(page.locator('[data-rpr="stop"]')).toBeVisible();
  await page.locator('[data-rpr="stop"]').click();
  const { meta, recording } = await newRecording(before);

  expect(meta).toMatchObject({ source: 'load', label: 'what the load costs' });
  // Everything the page mounted is in the recording, with the components it mounted on the way.
  expect(recording.totals.mounts).toBeGreaterThan(10);
  expect(recording.components.find((c) => c.name === 'PositionRow')?.mounts).toBe(3);
});

test('?rpr=rec records from the first render for a script', async ({ page }) => {
  const before = sessions();
  await page.goto('/?rpr=rec&tick=150');
  await expect(page.getByTestId('balance')).toBeVisible();
  await page.locator('[data-rpr="stop"]').click();
  const { meta, recording } = await newRecording(before);
  expect(meta.source).toBe('load');
  expect(recording.totals.mounts).toBeGreaterThan(10);
});

test('Esc cancels the picker and the page keeps working', async ({ page }) => {
  await open(page);
  await page.locator('[data-rpr="pick"]').click();
  await page.getByTestId('tab-orders').hover();
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-rpr="tree"]')).toHaveCount(0);
  await page.getByTestId('tab-orders').click();
  await expect(page.getByTestId('orders')).toBeVisible();
});

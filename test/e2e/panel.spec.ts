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
  await page.goto('/app?rpr=panel&tick=150');
  await expect(page.getByTestId('unread')).toBeVisible();
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
  // The rows render from the price feed, so wait until the recording has seen one tick before typing into the form.
  await expect(page.locator('[data-rpr="live-roots"]')).toContainText('MessageRow');
  await page.getByTestId('hook-name').pressSequentially('main');
  await page.getByTestId('hook-secret').pressSequentially('s3cret');
  await page.getByTestId('delete-m3').click();
  await page.locator('[data-rpr="stop"]').click();
  await expect(page.locator('[data-rpr="result"]')).toContainText('saved');
  const { meta, recording } = await newRecording(before);

  expect(meta).toMatchObject({ status: 'done', label: 'typing the key label' });
  const row = recording.roots.find((r) => r.name === 'MessageRow')!;
  const storeReason = row.reasons.find(([text]) => text.startsWith('external store'))![0];
  expect(storeReason).toMatch(/^external store #\d+ \[useChatStore\]/);
  const hook = row.hooks![/#(\d+)/.exec(storeReason)![1]];
  expect(hook.path).toEqual(['useMessageInfo', 'useBoundStore', 'useStore', 'useSyncExternalStoreWithSelector', 'SyncExternalStore']);
  expect(hook).toMatchObject({ library: 'zustand', libraryAt: 1 });
  // The call site in the component: the line where it calls the outermost custom hook.
  expect(hook.site).toMatch(/^src\/components\/Messages\.tsx:\d+$/);
  expect(hook.code).toBe('const info = useMessageInfo(id);');
  expect(recording.causes.map((c) => c.key)).toEqual(expect.arrayContaining(['zustand:feed/tick', 'zustand:messages/remove']));

  const typing = recording.actions.filter((a) => a.kind === 'typing');
  expect(typing.find((a) => a.target?.name === 'name')).toMatchObject({ chars: 4, length: 4 });
  expect(typing.find((a) => a.target?.name === 'name')).not.toHaveProperty('value');
  expect(typing.find((a) => a.target?.name === 'secret')).toMatchObject({ secret: true });
  expect(typing.find((a) => a.target?.name === 'secret')).not.toHaveProperty('length');
  const click = recording.actions.find((a) => a.kind === 'click' && a.target?.testId === 'delete-m3')!;
  expect(recording.segments.find((s) => s.action === click.id)!.reaction.commits).toBeGreaterThan(0);

  expect(recording.plugins.zustand.highlights?.join(' ')).toContain('useChatStore');
  expect(Object.keys(recording.plugins)).toEqual(expect.arrayContaining(['zustand', 'proxy-memoize', 'react-query']));
});

test('one click on the page is the area; the tree opens around it and moves it', async ({ page }) => {
  const before = sessions();
  await open(page);
  await page.locator('[data-rpr="pick"]').click();
  await page.getByTestId('message-m1').hover();
  await page.getByTestId('message-m1').click();
  // The click picks: the area is set at once and the tree stays open to change it.
  await expect(page.locator('[data-rpr="scope"]')).toHaveText('MessageRow');
  // The path from the app's own root down to the row; the router and the query client are packages.
  await expect(tree(page).first()).toHaveAttribute('data-name', 'Layout');
  await expect(page.locator('[data-rpr="tree"] li[data-name="RenderedRoute"]')).toHaveCount(0);
  await expect(page.locator('[data-rpr="tree"] li[data-active="true"]')).toHaveAttribute('data-name', 'MessageRow');
  // The neighbours of the picked row and what is inside it are listed without opening anything.
  await expect(page.locator('[data-rpr="tree"] li[data-name="MessageRow"]')).toHaveCount(3);
  await expect(page.locator('[data-rpr="tree"] li[data-name="Status"]')).toHaveCount(1);
  // Nothing is inside the cell, so its row offers no arrow to open.
  await expect(page.locator('[data-rpr="tree"] li[data-name="Status"] [data-rpr="expand"]')).toHaveText('');

  // ↓ moves the area with the active row; Esc puts back the area that was there before.
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('[data-rpr="scope"]')).toHaveText('Status');
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-rpr="scope"]')).toHaveText('Whole app');

  // Clicking a row confirms it and closes the tree.
  await page.locator('[data-rpr="pick"]').click();
  await page.getByTestId('message-m1').click();
  await page.locator('[data-rpr="tree"] li[data-active="true"]').click();
  await expect(page.locator('[data-rpr="tree"]')).toHaveCount(0);
  await expect(page.locator('[data-rpr="scope"]')).toHaveText('MessageRow');

  await page.locator('[data-rpr="record"]').click();
  await page.waitForTimeout(800);
  await page.locator('[data-rpr="stop"]').click();
  const { recording } = await newRecording(before);
  expect(recording.scope).toMatchObject({ name: 'MessageRow', state: 'attached' });
  // The row renders from its own subscription; its children are inside the area, the rest of the page is not.
  expect(recording.roots.map((r) => r.name)).toContain('MessageRow');
  expect(recording.components.map((c) => c.name)).toContain('Status');
  expect(recording.components.map((c) => c.name)).not.toContain('ConnectionStatus');
});

test('follows a component picked in the tree and shows the leading roots live', async ({ page }) => {
  const before = sessions();
  await open(page);
  await page.locator('[data-rpr="pick"]').click();
  await page.getByTestId('message-m1').click();
  await page.locator('[data-rpr="tree"] li[data-name="MessageRow"] [data-rpr="watch-toggle"]').first().click();
  // Esc leaves the tree and the whole app as the area; the component stays followed.
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-rpr="watch"] [data-name="MessageRow"]')).toBeVisible();

  await page.locator('[data-rpr="record"]').click();
  // While it records, the panel names the roots leading so far.
  await expect(page.locator('[data-rpr="live-roots"]')).toContainText('MessageRow');
  await expect(page.locator('[data-rpr="live-roots"]')).toContainText('external store');
  await page.locator('[data-rpr="stop"]').click();
  const { recording } = await newRecording(before);
  expect(recording.watch?.MessageRow.renders).toBeGreaterThan(0);
  expect(recording.watch?.MessageRow.mounted).toBe(3);
  await expect(page.locator('[data-rpr="result"]')).toContainText('Watched');

  // The chip removes it again.
  await page.locator('[data-rpr="watch"] [data-name="MessageRow"]').click();
  await expect(page.locator('[data-rpr="watch"] [data-name="MessageRow"]')).toHaveCount(0);
});

test('copies the area for an assistant', async ({ page }) => {
  await open(page);
  await page.locator('[data-rpr="pick"]').click();
  await page.getByTestId('message-m1').click();
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-rpr="scope"]')).toHaveText('MessageRow');
  await page.locator('[data-rpr="copy-scope"]').click();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toContain('Component: MessageRow — src/components/Messages.tsx:');
  expect(copied).toContain('› MessageList › MessageRow');
  expect(copied).toContain('Element: <li data-testid="message-m1"');
  expect(copied).toContain('Inside: Status');
  expect(copied).toContain('react-perf-recorder scope: {"names":');
});

test('outlines renders inside the area while nothing is recorded, and marks recordings made with it', async ({ page }) => {
  const before = sessions();
  await open(page);
  await page.locator('input[data-rpr="highlight"]').check();
  await page.locator('[data-rpr="pick"]').click();
  await page.getByTestId('messages').click();
  await page.locator('[data-rpr="tree"] li[data-name="MessageList"]').click();
  await expect(page.locator('[data-rpr="scope"]')).toHaveText('MessageList');
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
  await page.goto('/app?tick=150');
  await expect(page.getByTestId('unread')).toBeVisible();
  await expect(page.locator('[data-rpr="record"]')).toBeHidden();
  await page.keyboard.press('Alt+Shift+KeyR');
  await page.getByTestId('tab-people').click();
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
  await expect(page.getByTestId('unread')).toBeVisible();
  await expect(page.locator('[data-rpr="stop"]')).toBeVisible();
  await page.locator('[data-rpr="stop"]').click();
  const { meta, recording } = await newRecording(before);

  expect(meta).toMatchObject({ source: 'load', label: 'what the load costs' });
  // Everything the page mounted is in the recording, with the components it mounted on the way.
  expect(recording.totals.mounts).toBeGreaterThan(10);
  expect(recording.components.find((c) => c.name === 'MessageRow')?.mounts).toBe(3);
});

test('?rpr=rec records from the first render for a script', async ({ page }) => {
  const before = sessions();
  await page.goto('/app?rpr=rec&tick=150');
  await expect(page.getByTestId('unread')).toBeVisible();
  await page.locator('[data-rpr="stop"]').click();
  const { meta, recording } = await newRecording(before);
  expect(meta.source).toBe('load');
  expect(recording.totals.mounts).toBeGreaterThan(10);
});

test('Esc cancels the picker and the page keeps working', async ({ page }) => {
  await open(page);
  await page.locator('[data-rpr="pick"]').click();
  await page.getByTestId('tab-people').hover();
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-rpr="tree"]')).toHaveCount(0);
  await page.getByTestId('tab-people').click();
  await expect(page.getByTestId('people')).toBeVisible();
});

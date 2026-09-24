import fs from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import type { RecordingV2, SessionMeta } from '../../src/shared/schema';
import { reasonsById, textOf } from '../../src/shared/summary';
import { SESSIONS_DIR } from '../../playwright.config';

test.use({ permissions: ['clipboard-read', 'clipboard-write'] });

async function newRecording(page: Page): Promise<{ meta: SessionMeta; recording: RecordingV2 }> {
  // The id the panel saved this recording under: other specs record into the same folder at the same time.
  const saved = page.locator('.result-bar .saved');
  await expect(saved).toHaveText(/^saved \S+/, { timeout: 15_000 });
  const id = ((await saved.textContent()) ?? '').replace(/^saved /, '');
  await expect.poll(() => fs.existsSync(path.join(SESSIONS_DIR, id, 'recording.json'))).toBe(true);
  const dir = path.join(SESSIONS_DIR, id);
  return {
    meta: JSON.parse(fs.readFileSync(path.join(dir, 'session.json'), 'utf8')),
    recording: JSON.parse(fs.readFileSync(path.join(dir, 'recording.json'), 'utf8')),
  };
}

const open = async (page: Page) => {
  await page.goto('/app?rpr=panel&tick=150');
  await expect(page.getByTestId('unread')).toBeVisible();
};

const tree = (page: Page) => page.locator('[data-rpr="tree"] li[data-name]');
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

test('records a session from the panel with store causes, hook names and masked input', async ({ page }) => {
  await open(page);
  // The note is off in the panel for now, so nothing of it may reach a recording.
  await expect(page.locator('[data-rpr="note"]')).toHaveCount(0);
  await page.locator('[data-rpr="record"]').click();
  // The rows render from the price feed, so wait until the recording has seen one tick before typing into the form.
  await expect(page.locator('[data-rpr="live-roots"]')).toContainText('Status');
  await page.getByTestId('hook-name').pressSequentially('main');
  await page.getByTestId('hook-secret').pressSequentially('s3cret');
  await page.getByTestId('delete-m3').click();
  await page.locator('[data-rpr="stop"]').click();
  await expect(page.locator('[data-rpr="result"]')).toContainText('saved');
  const { meta, recording } = await newRecording(page);

  expect(meta).toMatchObject({ status: 'done' });
  expect(meta.label).toBeUndefined();
  const row = recording.roots.find((r) => r.name === 'Status')!;
  const byId = reasonsById(recording.reasons);
  const storeReason = row.reasons.map(([id]) => byId.get(id)!).find((r) => r.kind === 'store')!;
  // The sentence is built from the fields on read; the recording keeps the fields.
  expect(textOf(storeReason)).toMatch(/^external store #\d+ \[useChatStore\]/);
  expect(storeReason).toMatchObject({ kind: 'store', store: 'useChatStore' });
  // The hook is named by the reason itself; nothing has to read the sentence to find it.
  const hook = row.hooks![storeReason.hook!];
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
  await expect(page.locator('[data-rpr="tree"] li[data-name="TimeAgo"]')).toHaveCount(1);
  await expect(page.locator('[data-rpr="tree"] li[data-name="Status"]')).toHaveCount(1);
  // Nothing is inside the cell, so its row offers no arrow to open.
  await expect(page.locator('[data-rpr="tree"] li[data-name="TimeAgo"] [data-rpr="expand"]')).toHaveText('');

  // ↓ moves the area with the active row; Esc puts back the area that was there before.
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('[data-rpr="scope"]')).toHaveText('TimeAgo');
  await page.keyboard.press('Escape');
  // No area again: the whole app, which has no chip of its own.
  await expect(page.locator('[data-rpr="scope"]')).toBeHidden();

  // Clicking a row confirms it and closes the tree.
  await page.locator('[data-rpr="pick"]').click();
  await page.getByTestId('message-m1').click();
  await page.locator('[data-rpr="tree"] li[data-active="true"]').click();
  await expect(page.locator('[data-rpr="tree"]')).toHaveCount(0);
  await expect(page.locator('[data-rpr="scope"]')).toHaveText('MessageRow');

  await page.locator('[data-rpr="record"]').click();
  // Reactions land on one message at a time, so the recording has to be long enough for this row's turn.
  await page.waitForTimeout(3000);
  await page.locator('[data-rpr="stop"]').click();
  const { recording } = await newRecording(page);
  expect(recording.scope).toMatchObject({ name: 'MessageRow', state: 'attached' });
  // The row renders from its own subscription; its children are inside the area, the rest of the page is not.
  expect(recording.roots.map((r) => r.name)).toContain('Status');
  expect(recording.components.map((c) => c.name)).toContain('Status');
  expect(recording.components.map((c) => c.name)).not.toContain('TypingLine');
});

test('follows a component picked in the tree and shows the leading roots live', async ({ page }) => {
  await open(page);
  await page.locator('[data-rpr="pick"]').click();
  await page.locator('[data-testid="message-m1"] .status').click();
  await page.locator('[data-rpr="tree"] li[data-name="Status"] [data-rpr="watch-toggle"]').first().click();
  // Esc leaves the tree and the whole app as the area; the component stays followed.
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-rpr="watch"] [data-name="Status"]')).toBeVisible();

  // In a bottom corner the panel grows upwards, so the roots filling in must not move the buttons: they sit above.
  const buttonAt = () => page.locator('.row.controls').evaluate((el) => Math.round(el.getBoundingClientRect().top));
  const atRest = await buttonAt();
  await page.locator('[data-rpr="record"]').click();
  // While it records, the panel names the roots leading so far.
  await expect(page.locator('[data-rpr="live-roots"]')).toContainText('Status');
  // Each leading root as a reason row: the kind as a chip, the store it subscribes to next to it.
  await expect(page.locator('[data-rpr="live-roots"] .kind[data-kind="store"]').first()).toBeVisible();
  expect(await buttonAt()).toBe(atRest);
  await page.locator('[data-rpr="stop"]').click();
  const { recording } = await newRecording(page);
  expect(recording.watch?.Status.renders).toBeGreaterThan(0);
  expect(recording.watch?.Status.mounted).toBe(3);
  await expect(page.locator('[data-rpr="result"]')).toContainText('Watched');

  // The chip removes it again.
  await page.locator('[data-rpr="watch"] [data-name="Status"]').click();
  await expect(page.locator('[data-rpr="watch"] [data-name="Status"]')).toHaveCount(0);
});

test('copies the area for an assistant', async ({ page, baseURL }) => {
  await open(page);
  await page.locator('[data-rpr="pick"]').click();
  await page.getByTestId('message-m1').click();
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-rpr="scope"]')).toHaveText('MessageRow');
  await page.locator('[data-rpr="copy-scope"]').click();
  // The button says it worked, for a moment, where the pointer is; nothing is written below the controls.
  await expect(page.locator('[data-rpr="copy-scope"]')).toHaveText('✓');
  await expect(page.locator('[data-rpr="message"]')).toHaveText('');
  await expect(page.locator('[data-rpr="copy-scope"]')).toHaveText('⧉', { timeout: 3000 });
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  // The tool's own flag is not part of the address the assistant should reproduce.
  expect(copied).toContain(`React area on ${baseURL}/app?tick=150\n`);
  expect(copied).toContain('Component: MessageRow — src/components/Messages.tsx:');
  expect(copied).toContain('› MessageList › MessageRow');
  expect(copied).toContain('Element: <li data-testid="message-m1"');
  expect(copied).toContain('Inside: TimeAgo, Status');
  expect(copied).toContain('react-perf-recorder scope: {"names":');
});

test('outlines renders inside the area while nothing is recorded, and marks recordings made with it', async ({ page }) => {
  await open(page);
  await page.locator('input[data-rpr="highlight"]').check();
  await page.locator('[data-rpr="pick"]').click();
  await page.getByTestId('messages').click();
  await page.locator('[data-rpr="tree"] li[data-name="MessageList"]').click();
  await expect(page.locator('[data-rpr="scope"]')).toHaveText('MessageList');
  await expect.poll(() => painted(page)).toBe(true);

  await page.locator('[data-rpr="record"]').click();
  // The area is named while recording, but it cannot be picked again.
  await expect(page.locator('[data-rpr="pick"]')).toBeHidden();
  await expect(page.locator('[data-rpr="scope"]')).toBeVisible();
  await page.waitForTimeout(600);
  await page.locator('[data-rpr="stop"]').click();
  await expect(page.locator('[data-rpr="pick"]')).toBeVisible();
  const { recording } = await newRecording(page);
  expect(recording.overhead.highlight).toBe(true);
  expect(recording.warnings.some((w) => w.startsWith('highlight was on'))).toBe(true);

  await page.locator('input[data-rpr="highlight"]').uncheck();
  await expect.poll(() => painted(page)).toBe(false);
});

test('the dot is dragged anywhere and sticks to the nearest edge', async ({ page }) => {
  await open(page);
  await page.locator('[data-rpr="collapse"]').click();
  const dot = page.locator('[data-rpr="toggle"]');
  await expect(dot).toBeVisible();
  const before = (await dot.boundingBox())!;
  await page.mouse.move(before.x + before.width / 2, before.y + before.height / 2);
  await page.mouse.down();
  await page.mouse.move(1200, 300, { steps: 8 });
  await page.mouse.up();

  const view = page.viewportSize()!;
  const after = (await dot.boundingBox())!;
  // The nearest edge is the right one: it sits the usual gap from it, at the height it was let go of.
  expect(Math.round(after.x + after.width)).toBe(view.width - 12);
  expect(Math.round(after.y + after.height / 2)).toBe(300);
  // A drag is not a click: the card stays closed.
  await expect(page.locator('[data-rpr="record"]')).toBeHidden();
  await dot.click();
  await expect(page.locator('[data-rpr="record"]')).toBeVisible();

  // And the place survives a reload, card and all: held by the same corner, it opens down and to the left of it.
  await page.goto('/app?tick=150');
  const card = (await page.locator('.card').boundingBox())!;
  expect(Math.round(card.x + card.width)).toBe(view.width - 12);
  expect(Math.round(card.y)).toBe(Math.round(after.y));

  // Let go of past the edge of the window: the pointer is held, so the drag still ends where it was released.
  await page.locator('[data-rpr="collapse"]').click();
  const held = (await dot.boundingBox())!;
  await page.mouse.move(held.x + held.width / 2, held.y + held.height / 2);
  await page.mouse.down();
  await page.mouse.move(40, view.height + 60, { steps: 6 });
  await page.mouse.up();
  const bottom = (await dot.boundingBox())!;
  expect(Math.round(bottom.y + bottom.height)).toBe(view.height - 12);
  expect(Math.round(bottom.x + bottom.width / 2)).toBe(40);

  // The top and bottom edges hold it the same way: the gap from the edge, and anywhere along it.
  await page.mouse.move(bottom.x + bottom.width / 2, bottom.y + bottom.height / 2);
  await page.mouse.down();
  await page.mouse.move(600, 90, { steps: 6 });
  await page.mouse.up();
  const up = (await dot.boundingBox())!;
  expect(Math.round(up.y)).toBe(12);
  expect(Math.round(up.x + up.width / 2)).toBe(600);
  await dot.click();
  await expect(page.locator('[data-rpr="record"]')).toBeVisible();
});

test('the card is dragged by its title bar, edge included', async ({ page }) => {
  await open(page);
  const view = page.viewportSize()!;
  const before = (await page.locator('.rpr').boundingBox())!;
  // The very top edge of the card, above the word in the title bar: the handle takes the card's padding too.
  await page.mouse.move(before.x + 60, before.y + 2);
  await page.mouse.down();
  await page.mouse.move(120, 300, { steps: 8 });
  await page.mouse.up();
  const after = (await page.locator('.rpr').boundingBox())!;
  // Dropped nearer the left edge than the top one, it takes the left edge at the usual gap.
  expect(Math.round(after.x)).toBe(12);
  expect(Math.round(after.y)).toBeGreaterThan(200);
  expect(Math.round(after.y)).toBeLessThan(view.height / 2);
});

test('the shortcut opens the panel and records', async ({ page }) => {
  await page.goto('/app?tick=150');
  await expect(page.getByTestId('unread')).toBeVisible();
  await expect(page.locator('[data-rpr="record"]')).toBeHidden();
  await page.keyboard.press('Alt+Shift+KeyR');
  await page.getByTestId('tab-people').click();
  await page.keyboard.press('Alt+Shift+KeyR');
  const { recording } = await newRecording(page);
  expect(recording.tool.source).toBe('panel');
  expect(recording.totals.commitsInScope).toBeGreaterThan(0);
  await expect(page.locator('[data-rpr="record"]')).toBeVisible();
});

test('records the page load: the panel reloads into a recording', async ({ page }) => {
  await open(page);
  await page.locator('[data-rpr="record-on-load"]').click();
  await expect(page.getByTestId('unread')).toBeVisible();
  await expect(page.locator('[data-rpr="stop"]')).toBeVisible();
  await page.locator('[data-rpr="stop"]').click();
  const { meta, recording } = await newRecording(page);

  expect(meta).toMatchObject({ source: 'load', label: 'from page load' });
  // Everything the page mounted is in the recording, with the components it mounted on the way.
  expect(recording.totals.mounts).toBeGreaterThan(10);
  expect(recording.components.find((c) => c.name === 'MessageRow')?.mounts).toBe(3);
});

test('records the page load inside the area picked before it', async ({ page }) => {
  await open(page);
  await page.locator('[data-rpr="pick"]').click();
  await page.getByTestId('messages').click();
  await page.locator('[data-rpr="tree"] li[data-name="MessageList"]').click();
  await expect(page.locator('[data-rpr="scope"]')).toHaveText('MessageList');
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-rpr="scope"]')).toHaveText('MessageList');
  await page.locator('[data-rpr="record-on-load"]').click();
  await expect(page.locator('[data-rpr="stop"]')).toBeVisible();
  // The reloaded panel says what is being recorded: the area, not Pick as if it were the whole app.
  await expect(page.locator('[data-rpr="scope"]')).toHaveText('MessageList');
  await page.locator('[data-rpr="stop"]').click();
  const { meta, recording } = await newRecording(page);

  expect(meta.source).toBe('load');
  expect(recording.scope).toMatchObject({ name: 'MessageList' });
  expect(recording.totals.commitsInScope).toBeLessThan(recording.totals.commits);
});

test('?rpr=rec records from the first render for a script', async ({ page }) => {
  await page.goto('/app?rpr=rec&tick=150');
  await expect(page.getByTestId('unread')).toBeVisible();
  await page.locator('[data-rpr="stop"]').click();
  const { meta, recording } = await newRecording(page);
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

test('the result draws the recording in time and opens the commit you click', async ({ page }) => {
  await open(page);
  await page.locator('[data-rpr="record"]').click();
  await expect(page.locator('[data-rpr="live-roots"]')).toContainText('Status');
  await page.getByTestId('tab-people').click();
  await page.waitForTimeout(400);
  await page.locator('[data-rpr="stop"]').click();
  await expect(page.locator('[data-rpr="result"]')).toContainText('saved');

  const bars = page.locator('.tl-bar');
  expect(await bars.count()).toBeGreaterThan(1);
  // The count of hidden commits grows to the left of the filter, so ticking it never moves the box under the pointer.
  const boxAt = () => page.locator('input[data-rpr="tl-changed"]').evaluate((el) => Math.round(el.getBoundingClientRect().left));
  const boxAtRest = await boxAt();
  await page.locator('input[data-rpr="tl-changed"]').check();
  expect(await boxAt()).toBe(boxAtRest);
  await page.locator('input[data-rpr="tl-changed"]').uncheck();
  // A mark per action the person did, and the bar of a commit tells what it rendered.
  expect(await page.locator('.tl-mark').count()).toBeGreaterThan(0);
  // With nothing picked, the tracks say what is in the part of the recording being looked at.
  await expect(page.locator('.tl-detail')).toContainText('commits');
  await bars.last().click();
  // The cursor line is only drawn for a picked commit, so it proves the click landed on the bar.
  await expect(page.locator('.tl-cursor')).toBeVisible();
  await expect(page.locator('.tl-detail .tl-head')).toContainText('renders');

  // Zooming spreads the commits apart and keeps the strip scrollable — by the buttons and by the wheel over it.
  const width = () => page.locator('.tl-strip').evaluate((el) => el.getBoundingClientRect().width);
  const fit = await width();
  await page.locator('[data-rpr="tl-in"]').click();
  expect(await width()).toBeGreaterThan(fit * 1.5);
  await page.locator('[data-rpr="tl-out"]').click();
  expect(await width()).toBeCloseTo(fit, 0);
  await page.locator('.tl-scroll').hover();
  await page.mouse.wheel(0, -400);
  await expect.poll(width).toBeGreaterThan(fit * 1.5);
  await page.mouse.wheel(0, 800);
  await expect.poll(width).toBeCloseTo(fit, 0);

  // Clicking an action lights up every commit it is answerable for, not just the first.
  await page.locator('.tl-mark').first().click();
  await expect(page.locator('.tl-detail .tl-head')).toContainText('click');
  await expect(page.locator('.tl-strip[data-lit="true"]')).toBeVisible();
  expect(await page.locator('.tl-bar[data-lit="true"]').count()).toBeGreaterThan(0);
  // And from there into one of its commits.
  await page.locator('.tl-detail .tl-link').first().click();
  await expect(page.locator('.tl-detail .tl-head')).toContainText('renders');

  // Dragging across the overview looks closer at that part, and the tracks say what is in the window.
  await page.locator('[data-rpr="tl-overview"]').scrollIntoViewIfNeeded();
  const strip = (await page.locator('[data-rpr="tl-overview"]').boundingBox())!;
  await page.mouse.move(strip.x + strip.width * 0.3, strip.y + strip.height / 2);
  await page.mouse.down();
  await page.mouse.move(strip.x + strip.width * 0.7, strip.y + strip.height / 2, { steps: 6 });
  await page.mouse.up();
  await expect.poll(width).toBeGreaterThan(fit * 1.5);
  await expect(page.locator('.tl-brush')).toBeVisible();

  // And dragging the tracks themselves moves them sideways.
  const scrolled = () => page.locator('.tl-scroll').evaluate((el) => el.scrollLeft);
  const wasAt = await scrolled();
  const tracks = (await page.locator('.tl-scroll').boundingBox())!;
  await page.mouse.move(tracks.x + tracks.width * 0.7, tracks.y + tracks.height / 2);
  await page.mouse.down();
  await page.mouse.move(tracks.x + tracks.width * 0.2, tracks.y + tracks.height / 2, { steps: 6 });
  await page.mouse.up();
  await expect.poll(scrolled).toBeGreaterThan(wasAt);

  // And the renders that changed nothing can be taken out of the picture.
  const all = await bars.count();
  await page.locator('[data-rpr="tl-changed"]').check();
  expect(await bars.count()).toBeLessThanOrEqual(all);
  await expect(page.locator('.tl-controls')).toContainText('changed the DOM');
});

test('the area comes back after a reload, and × forgets it', async ({ page }) => {
  await open(page);
  await page.locator('[data-rpr="pick"]').click();
  await page.getByTestId('message-m1').click();
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-rpr="scope"]')).toHaveText('MessageRow');

  // A reload loses the component itself; the panel finds it again by its path once the app has rendered it.
  await page.reload();
  await expect(page.getByTestId('unread')).toBeVisible();
  await expect(page.locator('[data-rpr="scope"]')).toHaveText('MessageRow');

  // A page without that component keeps the whole app, and says nothing about it.
  await page.goto('/basics/keys?rpr=panel');
  await expect(page.getByTestId('list-id')).toBeVisible();
  await page.waitForTimeout(600);
  await expect(page.locator('[data-rpr="scope"]')).toBeHidden();
  await expect(page.locator('[data-rpr="message"]')).toHaveText('');

  // × is a choice of the whole app: after it, a reload brings nothing back.
  await open(page);
  await expect(page.locator('[data-rpr="scope"]')).toHaveText('MessageRow');
  await page.locator('[data-rpr="clear-scope"]').click();
  await page.reload();
  await expect(page.getByTestId('unread')).toBeVisible();
  await page.waitForTimeout(600);
  await expect(page.locator('[data-rpr="scope"]')).toBeHidden();
});

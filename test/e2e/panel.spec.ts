import fs from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import type { RecordingV1, SessionMeta } from '../../src/shared/schema';
import { SESSIONS_DIR } from '../../playwright.config';

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
  await page.goto('/?rpr=panel');
  await expect(page.getByTestId('increment')).toBeVisible();
  await page.locator('[data-rpr="toggle"]').click();
};

test('records a session from the panel: roots, store causes, hook names and actions', async ({ page }) => {
  const before = sessions();
  await open(page);
  await page.locator('[data-rpr="record"]').click();
  for (let i = 0; i < 3; i++) await page.getByTestId('increment').click();
  await page.getByTestId('amount').pressSequentially('123');
  await page.getByTestId('password').pressSequentially('secret');
  await page.locator('[data-rpr="stop"]').click();
  await expect(page.locator('[data-rpr="result"]')).toContainText('saved');
  const { meta, recording } = await newRecording(before);

  expect(meta.status).toBe('done');
  const counter = recording.roots.find((r) => r.name === 'Counter')!;
  const storeReason = counter.reasons.find(([text]) => text.startsWith('external store'))![0];
  expect(storeReason).toMatch(/^external store #\d+ \[useCounterStore\] selectCount$/);
  const hook = counter.hooks![/#(\d+)/.exec(storeReason)![1]];
  // useBoundStore is the hook zustand's create() returns; the stack shows function names, not variables.
  expect(hook.path).toEqual(['useCount', 'useBoundStore', 'useStore', 'useSyncExternalStoreWithSelector', 'SyncExternalStore']);
  // The call site inside the component: where it calls the outermost custom hook.
  expect(hook.site).toBe('src/App.tsx:8');
  expect(hook.code).toBe('const count = useCount();');
  expect(recording.causes.map((c) => c.key)).toContain('zustand:counter/increment');

  const typing = recording.actions.filter((a) => a.kind === 'typing');
  expect(typing.find((a) => a.target?.name === 'amount')).toMatchObject({ chars: 3, length: 3 });
  expect(typing.find((a) => a.target?.name === 'amount')).not.toHaveProperty('value');
  expect(typing.find((a) => a.target?.name === 'password')).toMatchObject({ secret: true });
  expect(typing.find((a) => a.target?.name === 'password')).not.toHaveProperty('length');
  const clicks = recording.actions.filter((a) => a.kind === 'click' && a.target?.testId === 'increment');
  expect(clicks).toHaveLength(3);
  const clickSegment = recording.segments.find((s) => s.action === clicks[0].id)!;
  expect(clickSegment.reaction.commits).toBeGreaterThan(0);

  const memo = recording.plugins['proxy-memoize'].data as { selectors: Array<{ name: string; calls: number }> };
  expect(memo.selectors.find((s) => s.name === 'selectCount')!.calls).toBeGreaterThan(0);
  expect(recording.plugins.zustand.highlights?.[0]).toMatch(/^useCounterStore: \d+ updates$/);
});

test('picks an area and reports the root that re-rendered it from outside', async ({ page }) => {
  const before = sessions();
  await open(page);
  await page.locator('[data-rpr="pick"]').click();
  await page.getByTestId('row-a').hover();
  await page.getByTestId('row-a').click();
  const items = page.locator('[data-rpr="picker"] li');
  await expect(items.first()).toContainText('Row');
  await page.locator('[data-rpr="picker"] li[data-name="Rows"]').click();
  await expect(page.locator('[data-rpr="scope"]')).toHaveText('Rows');
  await page.locator('[data-rpr="record"]').click();
  await page.getByTestId('rerender-app').click();
  await page.getByTestId('tick').click();
  await page.locator('[data-rpr="stop"]').click();
  const { recording } = await newRecording(before);

  expect(recording.scope).toMatchObject({ name: 'Rows', state: 'attached' });
  expect(recording.outsideRoots[0]).toMatchObject({ name: 'App', reasons: [['state #0', 1]] });
  const row = recording.components.find((c) => c.name === 'Row')!;
  expect(row.memo).toBe(true);
  expect(row.reasons.map(([text]) => text)).toContain('parent: props same: style');
  // One slot of memoizeWithArgs shared by three rows: rows b and c get new objects with the same content.
  const rowReasons = recording.roots.find((r) => r.name === 'Row')!.reasons.map(([text]) => text);
  expect(rowReasons).toContainEqual(expect.stringMatching(/^external store #\d+ SAME-CONTENT \[useCounterStore\] \(s\) ?=> ?selectRow\(s, id\)$/));
  const selectRow = (
    recording.plugins['proxy-memoize'].data as { selectors: Array<{ name: string; thrash: boolean; distinctArgs: number }> }
  ).selectors.find((s) => s.name === 'selectRow')!;
  expect(selectRow.distinctArgs).toBe(3);
});

test('highlights renders on a canvas and Esc cancels the picker', async ({ page }) => {
  await open(page);
  await page.locator('[data-rpr="record"]').click();
  await page.getByTestId('increment').click();
  const painted = await page.waitForFunction(() => {
    const host = document.querySelector('[data-react-perf-recorder]');
    const canvas = host?.shadowRoot?.querySelector('canvas');
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return false;
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    for (let i = 3; i < data.length; i += 4) if (data[i]) return true;
    return false;
  });
  expect(await painted.jsonValue()).toBe(true);
  await page.locator('[data-rpr="stop"]').click();

  await page.locator('[data-rpr="pick"]').click();
  await page.keyboard.press('Escape');
  await page.getByTestId('increment').click();
  await expect(page.getByTestId('increment')).toContainText('count 2');
});

test('shortcut starts and stops a recording without the panel visible', async ({ page }) => {
  const before = sessions();
  await page.goto('/');
  await expect(page.getByTestId('increment')).toBeVisible();
  await expect(page.locator('[data-rpr="record"]')).toBeHidden();
  await page.keyboard.press('Alt+Shift+KeyR');
  await page.getByTestId('increment').click();
  await page.keyboard.press('Alt+Shift+KeyR');
  const { recording } = await newRecording(before);
  expect(recording.tool.source).toBe('panel');
  expect(recording.totals.commitsInScope).toBeGreaterThan(0);
});

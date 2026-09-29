import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { recordPage } from '../../src/mcp/record';
import type { RecordingV2 } from '../../src/shared/schema';
import { SESSIONS_DIR } from '../../playwright.config';

/**
 * test/next served by `next dev` on Turbopack and on webpack: record_page puts the recorder in. The app router
 * hydrates `document` and Next's dev overlay is a React root of its own; the pages router hydrates a div.
 */
const saved = (id: string): RecordingV2 => JSON.parse(fs.readFileSync(path.join(SESSIONS_DIR, id, 'recording.json'), 'utf8'));
const root = path.resolve('test/next');

const clicks = (() => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'rpr-script-')), 'clicks.mjs');
  fs.writeFileSync(
    file,
    "export default async (page) => {\n  for (let i = 0; i < 3; i++) { await page.getByTestId('more').click(); await page.waitForTimeout(100); }\n};\n"
  );
  return file;
})();

const counterOf = (rec: RecordingV2) => rec.roots.find((r) => r.name === 'Counter');

for (const [page, source] of [
  ['/client', 'app/client/page.tsx:7'],
  ['/server', 'app/server/page.tsx:8'],
  ['/legacy', 'pages/legacy.tsx:4'],
] as const)
  test(`records ${page} with the lines of its hooks`, async ({ baseURL }) => {
    const result = await recordPage({ url: `${baseURL}${page}`, ms: 1000, script: clicks, root }, SESSIONS_DIR);
    expect(result.recorder).toBe('injected');
    const rec = saved(result.id!);
    const counter = counterOf(rec);
    expect(counter?.source).toBe(source);
    expect(Object.values(counter?.hooks ?? {})).toContainEqual(
      expect.objectContaining({ site: 'components/Counter.tsx:14', code: 'const clicks = useClicks((s) => s.clicks);', library: 'zustand' })
    );
    expect(rec.causes.map((c) => c.key)).toContain('zustand:clicks/more');
    // Next's dev overlay renders into a root of its own, which is not the app's.
    expect(rec.roots.every((r) => r.source)).toBe(true);
  });

test('records the app router from the load, hydration and all', async ({ baseURL }) => {
  const result = await recordPage({ url: `${baseURL}/client`, fromLoad: true, ms: 800, root }, SESSIONS_DIR);
  const rec = saved(result.id!);
  expect(rec.totals.mounts).toBeGreaterThan(20);
  expect(rec.totals.lanes).toHaveProperty('TransitionHydration');
});

test('records the pages router from the load', async ({ baseURL }) => {
  const result = await recordPage({ url: `${baseURL}/legacy`, fromLoad: true, ms: 800, root }, SESSIONS_DIR);
  const rec = saved(result.id!);
  expect(rec.totals.mounts).toBeGreaterThan(5);
  expect(rec.totals.lanes).toHaveProperty('DefaultHydration');
});

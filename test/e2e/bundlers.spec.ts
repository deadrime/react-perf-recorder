import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { recordPage } from '../../src/mcp/record';
import type { RecordingV2 } from '../../src/shared/schema';
import { SESSIONS_DIR } from '../../playwright.config';

/**
 * test/bundlers built by webpack (its default `eval`, with no source maps, and `eval-source-map`) and by Rsbuild,
 * which bundles modules into chunks: record_page puts the recorder in and learns whose code each line is.
 */
const saved = (id: string): RecordingV2 => JSON.parse(fs.readFileSync(path.join(SESSIONS_DIR, id, 'recording.json'), 'utf8'));
const root = path.resolve('test/bundlers');

const clicks = (() => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'rpr-script-')), 'clicks.mjs');
  fs.writeFileSync(
    file,
    "export default async (page) => {\n  for (let i = 0; i < 3; i++) { await page.getByTestId('more').click(); await page.waitForTimeout(100); }\n};\n"
  );
  return file;
})();

test('records the app with the lines of its hooks and the packages behind them', async ({ baseURL }) => {
  const result = await recordPage({ url: `${baseURL}/?tick=150`, ms: 1500, script: clicks, root }, SESSIONS_DIR);
  expect(result.recorder).toBe('injected');
  const rec = saved(result.id!);
  const counter = rec.roots.find((r) => r.name === 'Counter');
  expect(counter?.source).toBe('src/main.tsx:9');
  const hooks = Object.values(counter?.hooks ?? {});
  expect(hooks).toContainEqual(
    expect.objectContaining({ site: 'src/Counter.tsx:15', code: 'const clicks = useClicks((s) => s.clicks);', library: 'zustand' })
  );
  expect(hooks).toContainEqual(expect.objectContaining({ site: 'src/Counter.tsx:18', code: 'const tick = useTicker(tickMs);' }));
  expect(JSON.stringify(rec)).not.toContain('"generated"');
  const causes = rec.causes.map((c) => c.key);
  expect(causes).toContain('zustand:clicks/more');
  expect(causes).toContain('core:timer setInterval @ src/useTicker.ts');
});

test('records the page load', async ({ baseURL }) => {
  const result = await recordPage({ url: `${baseURL}/?tick=150`, fromLoad: true, ms: 800, root }, SESSIONS_DIR);
  expect(saved(result.id!).totals.mounts).toBeGreaterThanOrEqual(6);
});

test('with cpu, a render is named by its file and line', async ({ baseURL }) => {
  const result = await recordPage({ url: `${baseURL}/?tick=150`, ms: 1000, script: clicks, cpu: true, root }, SESSIONS_DIR);
  const cpu = saved(result.id!).cpu!;
  expect(cpu.renders.map((r) => `${r.name} ${r.site}`)).toContain('Counter src/Counter.tsx:14');
  expect(cpu.functions.some((f) => f.package === 'react-dom')).toBe(true);
});

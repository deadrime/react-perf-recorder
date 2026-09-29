import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { recordPage } from '../../src/mcp/record';
import type { RecordingV2 } from '../../src/shared/schema';
import { SESSIONS_DIR } from '../../playwright.config';

/**
 * React Router in framework mode renders the page's HTML itself and never runs Vite's transformIndexHtml, keeps the
 * app in `app/`, and hydrates from an entry inside node_modules: the recorder has to arrive through the module that
 * creates the root.
 */
const saved = (id: string): RecordingV2 => JSON.parse(fs.readFileSync(path.join(SESSIONS_DIR, id, 'recording.json'), 'utf8'));

test('records a page React Router renders, with the file, the store and the memo named', async ({ page, baseURL }) => {
  const errors: string[] = [];
  page.on('console', (m) => void (m.type() === 'error' && !/favicon/.test(m.text()) && errors.push(m.text())));
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${baseURL}/?rpr=panel`);
  await expect(page.locator('[data-rpr="record"]')).toBeVisible();

  await page.evaluate(() => (window as any).__REACT_PERF_RECORDER__.engine.start({ label: 'react-router' }));
  for (let i = 0; i < 3; i++) await page.getByTestId('more').click();
  await expect(page.getByTestId('clicks')).toHaveText('3');
  const id = await page.evaluate(async () => ((await (window as any).__REACT_PERF_RECORDER__.engine.stop()) as { id: string }).id);

  const rec = saved(id);
  const counter = rec.roots.find((r) => r.name === 'Counter');
  expect(counter?.hits).toBe(3);
  expect(Object.values(counter?.hooks ?? {}).map((h) => h.site)).toContain('app/routes/counter.tsx:12');
  expect(JSON.stringify(rec)).toContain('"Label"');
  expect(JSON.stringify(rec.causes)).toContain('useClicks.setState');
  // The server rendered the same markup the browser hydrated: nothing of the recorder ran there.
  expect(errors).toEqual([]);
});

test('records the page load, hydration and all', async ({ baseURL }) => {
  const result = await recordPage({ url: `${baseURL}/`, fromLoad: true, ms: 800 }, SESSIONS_DIR);
  expect(result.id).toBeTruthy();
  expect(saved(result.id!).totals.mounts).toBeGreaterThan(5);
});

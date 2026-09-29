import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { recordPage } from '../../src/mcp/record';
import type { RecordingV2 } from '../../src/shared/schema';
import { SESSIONS_DIR } from '../../playwright.config';

/**
 * The fixture app served by Vite with nothing of the recorder in it: record_page finds no plugin on the dev server,
 * puts the recorder into the page itself and maps positions through the source maps the page loaded.
 */
const saved = (id: string): RecordingV2 => JSON.parse(fs.readFileSync(path.join(SESSIONS_DIR, id, 'recording.json'), 'utf8'));
const root = path.resolve('test/e2e/fixture-app');

const moduleOf = (name: string, body: string) => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'rpr-script-')), `${name}.mjs`);
  fs.writeFileSync(file, `export default async (page) => {\n${body}\n};\n`);
  return file;
};

test('records a dev server without the plugin, with the lines of the hooks', async ({ baseURL }) => {
  const result = await recordPage({ url: `${baseURL}/app?tick=150`, ms: 1500, root }, SESSIONS_DIR);
  expect(result.recorder).toBe('injected');
  expect(result.warnings[0]).toMatch(/without the Vite plugin/);
  const rec = saved(result.id!);
  expect(rec.conditions.recorder).toBe('injected');
  const stats = rec.roots.find((r) => r.name === 'ChannelStats');
  expect(stats?.source).toBe('src/components/ChatView.tsx:37');
  expect(Object.values(stats?.hooks ?? {})).toContainEqual(
    expect.objectContaining({ site: 'src/components/ChannelStats.tsx:7', code: 'const { data } = useQuery({', library: '@tanstack/react-query' })
  );
  // No built position is left for a reader: every one was mapped or dropped.
  expect(JSON.stringify(rec)).not.toContain('"generated"');
  const causes = rec.causes.map((c) => c.key);
  // react-query needs nothing of the build; zustand's action names come through its devtools middleware.
  expect(causes).toContain('react-query:fetch → success ["presence"]');
  expect(causes).toContain('zustand:feed/tick');
});

test('records the page load without the plugin, and leaves the url alone', async ({ baseURL }) => {
  const result = await recordPage({ url: `${baseURL}/app?tick=150`, fromLoad: true, ms: 1200, root }, SESSIONS_DIR);
  expect(result.url).toBe(`${baseURL}/app?tick=150`);
  expect(saved(result.id!).totals.mounts).toBeGreaterThan(30);
});

test('records one component without the plugin', async ({ baseURL }) => {
  const result = await recordPage({ url: `${baseURL}/app?tick=120`, ms: 1000, scope: 'MessageList', root }, SESSIONS_DIR);
  expect(saved(result.id!).scope?.name).toBe('MessageList');
});

test('with cpu and without the plugin, the slow render is named with its line', async ({ baseURL }) => {
  const script = moduleOf(
    'init-renders',
    "for (let i = 0; i < 20; i++) { await page.getByTestId('render').first().click(); await page.waitForTimeout(20); }"
  );
  const result = await recordPage({ url: `${baseURL}/basics/init`, script, cpu: true, root }, SESSIONS_DIR);
  const cpu = saved(result.id!).cpu!;
  expect(cpu.renders[0]).toMatchObject({ name: 'NotesEager', site: expect.stringMatching(/Init\.tsx:\d+$/) });
  expect(cpu.renders[0].hot[0]).toMatchObject({ name: 'parseNotes', site: expect.stringMatching(/Init\.tsx:\d+$/) });
  // The recorder put into the page is its own, not the app's.
  expect(cpu.functions.some((f) => f.package === 'react-perf-recorder')).toBe(false);
});

test('never: without the plugin it says so rather than bring the recorder in', async ({ baseURL }) => {
  await expect(recordPage({ url: `${baseURL}/app`, ms: 300, inject: 'never' }, SESSIONS_DIR)).rejects.toThrow(
    /the Vite plugin is not in this dev server/
  );
});

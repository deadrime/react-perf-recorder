import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { recordPage } from '../../src/mcp/record';
import { section } from '../../src/mcp/server';
import type { RecordingV2 } from '../../src/shared/schema';
import { SESSIONS_DIR } from '../../playwright.config';

const saved = (id: string): RecordingV2 => JSON.parse(fs.readFileSync(path.join(SESSIONS_DIR, id, 'recording.json'), 'utf8'));

const moduleOf = (name: string, body: string) => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'rpr-script-')), `${name}.mjs`);
  fs.writeFileSync(file, `export default async (page) => {\n${body}\n};\n`);
  return file;
};

const record = async (baseURL: string | undefined, which: string, testId: string, throttle?: number) => {
  const script = moduleOf(which, `await page.getByTestId('${testId}').click(); await page.waitForTimeout(1500);`);
  const result = await recordPage({ url: `${baseURL}/test/shifts?case=${which}`, script, ...(throttle ? { throttle } : {}) }, SESSIONS_DIR);
  return saved(result.id!);
};

test('content that arrives late is blamed on the component the commit mounted above the list', async ({ baseURL }) => {
  const rec = await record(baseURL, 'late', 'load');
  const shifts = rec.shifts!;
  expect(shifts.list.length).toBeGreaterThan(0);
  const [first] = shifts.list;
  expect(first.hadRecentInput).toBe(false);
  expect(first.sources[0]).toMatchObject({ component: 'OrderList', node: expect.stringContaining('ul.orders') });
  expect(first.cause).toMatchObject({ commit: expect.any(Number), by: { component: 'PromoBanner', where: 'before', change: 'added' } });
  expect(first.sources[0].file).toMatch(/ShiftsPage\.tsx:\d+$/);
  expect(shifts.cls.value).toBeGreaterThan(0);
  const read = section(rec, 'shifts', 10, 0) as { items: string[] };
  expect(read.items[0]).toMatch(/OrderList \(.*ShiftsPage\.tsx:\d+\) moved down 120px at .*PromoBanner .* mounted above it in commit \d+/);
});

test('an image with no size set is named as one', async ({ baseURL }) => {
  const rec = await record(baseURL, 'image', 'photo');
  const [first] = rec.shifts!.list;
  expect(first.sources[0]).toMatchObject({ component: 'OrderList' });
  // A data: image is decoded in the frame that mounts it; one from the network would come as `resource: 'image'`.
  expect(first.cause).toMatchObject({ by: { component: 'ProductPhoto', where: 'before', unsized: true } });
  const read = section(rec, 'shifts', 10, 0) as { items: string[] };
  expect(read.items[0]).toMatch(/ProductPhoto .*img\.photo with no size set/);
});

test('a sheet opening by its height is a near miss on a fast machine and counted when the CPU is slow', async ({ baseURL }) => {
  const fast = await record(baseURL, 'sheet', 'open');
  const shifts = fast.shifts!;
  expect(shifts.list.length).toBeGreaterThan(3);
  expect(shifts.list.every((s) => s.hadRecentInput)).toBe(true);
  expect(shifts.list.filter((s) => 'animation' in s.cause).length).toBeGreaterThan(shifts.list.length / 2);
  expect(shifts.list.find((s) => 'animation' in s.cause)!.cause).toMatchObject({
    animation: 'inline-style',
    by: { component: 'Sheet', where: 'self', name: 'style' },
  });
  expect(shifts.cls.value).toBe(0);
  expect(shifts.cls.nearMiss).toBeGreaterThan(0);
  expect(section(fast, 'shifts', 10, 0)).toMatchObject({ hint: expect.stringContaining('throttle') });

  const slow = await record(baseURL, 'sheet', 'open', 6);
  expect(slow.shifts!.cls.value).toBeGreaterThan(0);
  expect(slow.shifts!.list.some((s) => !s.hadRecentInput && 'animation' in s.cause)).toBe(true);
});

test('a drawer slid in with a transform shifts nothing', async ({ baseURL }) => {
  const rec = await record(baseURL, 'slide', 'slide');
  expect(rec.shifts).toMatchObject({ list: [], cls: { value: 0, nearMiss: 0 } });
});

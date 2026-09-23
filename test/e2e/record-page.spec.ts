import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { recordPage } from '../../src/mcp/record';
import type { RecordingV2 } from '../../src/shared/schema';
import { SESSIONS_DIR } from '../../playwright.config';

const saved = (id: string): RecordingV2 => JSON.parse(fs.readFileSync(path.join(SESSIONS_DIR, id, 'recording.json'), 'utf8'));

/** The tool a proof needs: the same page recorded twice, without a person and without a hand-written driver. */
test('records a page in a browser of its own', async ({ baseURL }) => {
  const result = await recordPage({ url: `${baseURL}/app?tick=120`, ms: 1200, label: 'from the record tool' }, SESSIONS_DIR);
  expect(result.id).toBeTruthy();
  expect(result.commits).toBeGreaterThan(0);
  expect(result.url).toBe(`${baseURL}/app?tick=120`);
  const rec = saved(result.id!);
  expect(rec.tool.source).toBe('script:record');
  expect(rec.label).toBe('from the record tool');
  // A measuring run draws no outlines, so nothing warns that the timings read high.
  expect(rec.warnings.some((w) => w.startsWith('highlight was on'))).toBe(false);
});

test('records the page load, mounts and all', async ({ baseURL }) => {
  const result = await recordPage({ url: `${baseURL}/app?tick=120`, fromLoad: true, ms: 1200 }, SESSIONS_DIR);
  expect(result.id).toBeTruthy();
  expect(result.url).toContain('rpr=rec');
  expect(saved(result.id!).totals.mounts).toBeGreaterThan(10);
});

test('records one component, named the way its file names it', async ({ baseURL }) => {
  const result = await recordPage({ url: `${baseURL}/app?tick=120`, ms: 1000, scope: 'MessageList' }, SESSIONS_DIR);
  const rec = saved(result.id!);
  expect(rec.scope?.name).toBe('MessageList');
  // Narrowing does not lose the cause: what rendered from above is kept as an outside root.
  expect(rec.totals.commitsInScope).toBeLessThanOrEqual(rec.totals.commits);
});

test('an area that is not on the page answers with the ones that are', async ({ baseURL }) => {
  await expect(recordPage({ url: `${baseURL}/app?tick=120`, ms: 500, scope: 'NoSuchThing' }, SESSIONS_DIR)).rejects.toThrow(
    /is not mounted; the page has .*MessageList/
  );
});

test('says what is wrong instead of recording the wrong page', async () => {
  await expect(recordPage({ url: 'data:text/html,<h1>no react here', ms: 300 }, SESSIONS_DIR)).rejects.toThrow(/the recorder is not on/);
});

import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { recordPage } from '../../src/mcp/record';
import { section } from '../../src/mcp/server';
import { summarize } from '../../src/shared/summary';
import type { RecordingV2 } from '../../src/shared/schema';
import { SESSIONS_DIR } from '../../playwright.config';

const saved = (id: string): RecordingV2 => JSON.parse(fs.readFileSync(path.join(SESSIONS_DIR, id, 'recording.json'), 'utf8'));

const record = async (baseURL: string | undefined, which: string, fromLoad = true) => {
  const result = await recordPage({ url: `${baseURL}/test/lcp?case=${which}`, ...(fromLoad ? { fromLoad } : {}) }, SESSIONS_DIR);
  return saved(result.id!);
};

type Read = { line: string; phases: string; findings: string[]; before?: string[] };

test('an image mounted after data came in is named with the commit that mounted it and the timer behind it', async ({ baseURL }) => {
  const rec = await record(baseURL, 'late');
  const lcp = rec.lcp!;
  expect(lcp.element).toMatchObject({ component: 'HeroImage', kind: 'image', node: expect.stringContaining('img.hero') });
  expect(lcp.element.file).toMatch(/LcpPage\.tsx:\d+$/);
  expect(lcp.mount).toMatchObject({ commit: expect.any(Number), change: 'added' });
  // The request left with the mount, some 600 ms after the first render.
  const mount = lcp.mount as { ms: number };
  expect(lcp.image!.requestMs! - mount.ms).toBeLessThan(50);
  expect(lcp.phases.loadDelay).toBeGreaterThan(500);
  const { ttfb, loadDelay, loadDuration, renderDelay } = lcp.phases;
  expect(Math.abs(ttfb + loadDelay + loadDuration + renderDelay - lcp.ms)).toBeLessThanOrEqual(2);

  const read = section(rec, 'lcp', 10, 0) as Read;
  expect(read.line).toMatch(/^LCP \d\.\d\ds: img\.hero in HeroImage \(.*LcpPage\.tsx:\d+\), \/__lcp\/photo\.svg/);
  expect(read.findings[0]).toMatch(/^load delay \d+ms: the image was requested only when it was mounted in commit \d+ \(.*setTimeout.*\) at /);
  expect(summarize(rec).lcp).toMatch(/^LCP .*HeroImage.*; load delay .*; section lcp$/);
});

test('a lazy image as the largest paint is called out', async ({ baseURL }) => {
  const rec = await record(baseURL, 'lazy');
  expect(rec.lcp!.image).toMatchObject({ lazy: true });
  expect((section(rec, 'lcp', 10, 0) as Read).findings.join('\n')).toContain('loading="lazy"');
});

test("a heading painted by the app's first render is text mounted in React's first commit", async ({ baseURL }) => {
  const rec = await record(baseURL, 'text');
  expect(rec.lcp!.element).toMatchObject({ component: 'Headline', kind: 'text', node: expect.stringContaining('h1') });
  expect(rec.lcp!.mount).toMatchObject({ first: true, change: 'added' });
  // The panel shows while a recording runs; its own text is no candidate.
  expect(rec.lcp!.candidates.every((c) => c.element.component)).toBe(true);
});

test('an image held by a slow render as it arrived is blamed on what ran before its paint', async ({ baseURL }) => {
  const rec = await record(baseURL, 'blocked');
  expect(rec.lcp!.phases.renderDelay).toBeGreaterThan(300);
  const read = section(rec, 'lcp', 10, 0) as Read;
  // First or second: how long the app's first render takes, and with it the load delay, depends on the machine.
  expect(read.findings.slice(0, 2).join('\n')).toMatch(
    /^\d+ms from the image arriving to the paint: (1 long frame .* and )?1 commit .*ran in between$/m
  );
});

test('a recording started on a page already painted has no largest paint, and says how to get one', async ({ baseURL }) => {
  const rec = await record(baseURL, 'text', false);
  expect(rec.lcp).toBeUndefined();
  expect(section(rec, 'lcp', 10, 0)).toMatchObject({ note: expect.stringContaining('fromLoad') });
});

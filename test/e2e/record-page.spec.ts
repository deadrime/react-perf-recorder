import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { recordPage } from '../../src/mcp/record';
import { compareRecordings } from '../../src/shared/compare';
import { planReplay } from '../../src/shared/replay';
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

test('replays what a recording did, from the page load, at its pace', async ({ baseURL, page }) => {
  // The original: a person on the panel switching tabs and typing.
  await page.goto(`${baseURL}/app?rpr=panel&tick=150`);
  await expect(page.getByTestId('unread')).toBeVisible();
  await page.locator('[data-rpr="record"]').click();
  await page.getByTestId('tab-people').click();
  await page.getByTestId('tab-chat').click();
  await page.getByTestId('message').pressSequentially('hello', { delay: 50 });
  await page.locator('[data-rpr="stop"]').click();
  await expect(page.locator('[data-rpr="result"]')).toContainText('saved');
  const id = ((await page.locator('.result-bar .saved').textContent()) ?? '').replace('saved ', '');
  const original = saved(id);

  const result = await recordPage({ replay: { ...planReplay({ ...original, id }), url: original.page.url } }, SESSIONS_DIR);
  const again = saved(result.id!);
  const kinds = (rec: RecordingV2) => rec.actions.map((a) => [a.kind, a.target?.testId, a.chars ?? null]);
  // The same actions, in the same order, with the same number of keystrokes.
  expect(kinds(again)).toEqual(kinds(original));
  expect(again.totals.mounts).toBeGreaterThan(10);
  const cmp = compareRecordings(original, again);
  const people = cmp.actions.find((a) => a.action.includes('tab-people'))!;
  expect(people.times).toEqual({ before: 1, after: 1 });
  // A click made by the replay is a click to the recording: its renders are the reaction to it, as they were.
  expect(people.renders.after).toBe(people.renders.before);
  expect(people.renders.after).toBeGreaterThan(0);
  // And a replayed keystroke is scheduled by React as a person's is: the same renders per character. A feed tick
  // landing on one of the five keystrokes adds a render to one run and not the other; a keystroke React batched
  // differently would take renders away.
  const typing = cmp.actions.find((a) => a.per === 'char')!;
  const extra = Math.round((typing.renders.after! - typing.renders.before!) * 'hello'.length);
  expect(extra).toBeGreaterThanOrEqual(0);
  expect(extra).toBeLessThanOrEqual(1);
});

test('a recording from the page load keeps the area, the label and what to watch', async ({ baseURL }) => {
  const result = await recordPage(
    { url: `${baseURL}/app?tick=120`, fromLoad: true, ms: 800, scope: 'MessageList', label: 'after', watch: ['Status'] },
    SESSIONS_DIR
  );
  const rec = saved(result.id!);
  expect(rec.scope?.name).toBe('MessageList');
  expect(rec.label).toBe('after');
  expect(Object.keys(rec.watch ?? {})).toEqual(['Status']);
  // A measuring run draws no outlines.
  expect(rec.warnings.some((w) => w.startsWith('highlight was on'))).toBe(false);
});

test('a recording from the page load of an area that never mounts says what the page has', async ({ baseURL }) => {
  await expect(recordPage({ url: `${baseURL}/app?tick=120`, fromLoad: true, ms: 500, scope: 'NoSuchThing' }, SESSIONS_DIR)).rejects.toThrow(
    /did not start.*NoSuchThing.*the page has .*MessageList/
  );
});

const moduleOf = (name: string, body: string) => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'rpr-script-')), `${name}.mjs`);
  fs.writeFileSync(file, `export default async (page) => {\n${body}\n};\n`);
  return file;
};

test('a script that leaves the page is told it ended the recording, and what the page showed', async ({ baseURL }) => {
  const script = moduleOf('leaves', `await page.goto(${JSON.stringify(`${baseURL}/`)});`);
  const failure = await recordPage({ url: `${baseURL}/app?tick=120`, script }, SESSIONS_DIR).catch((error: Error) => error);
  expect(failure).toBeInstanceOf(Error);
  const message = (failure as Error).message;
  expect(message).toMatch(/the script navigated to .*ended with it/);
  expect(message).toMatch(/`setup`/);
  const shot = /screenshot (\S+\.png)/.exec(message)?.[1];
  expect(shot && fs.existsSync(shot)).toBe(true);
  fs.rmSync(shot!, { force: true });
});

test('a script that starts the recording itself is told record_page does it', async ({ baseURL }) => {
  const script = moduleOf('starts', "await page.evaluate(() => window.__REACT_PERF_RECORDER__.engine.start({ source: 'script' }));");
  await expect(recordPage({ url: `${baseURL}/app?tick=120`, script }, SESSIONS_DIR)).rejects.toThrow(/must not call engine\.start/);
});

test('setup runs before the page opens for the recording, and is not in it', async ({ baseURL }) => {
  const setup = moduleOf(
    'setup',
    `await page.goto(${JSON.stringify(`${baseURL}/`)});\nawait page.evaluate(() => localStorage.setItem('rpr-e2e-seed', 'seeded'));`
  );
  const script = moduleOf(
    'reads',
    "const seed = await page.evaluate(() => localStorage.getItem('rpr-e2e-seed'));\nif (seed !== 'seeded') throw new Error(`no seed: ${seed}`);\nawait page.waitForTimeout(300);"
  );
  const result = await recordPage({ url: `${baseURL}/app?tick=120`, setup, script }, SESSIONS_DIR);
  expect(result.id).toBeTruthy();
  const rec = saved(result.id!);
  expect(result.rendersPerCommit).toBe(rec.totals.rendersPerScopeCommit);
  expect(rec.page.url).toContain('/app');
  // A replay of it runs the same setup: the server finds it beside the recording.
  expect(JSON.parse(fs.readFileSync(path.join(SESSIONS_DIR, result.id!, 'record-page.json'), 'utf8'))).toEqual({ setup });
});

test('without a url, the recording starts on the page setup left, with what it built in memory', async ({ baseURL }) => {
  const setup = moduleOf(
    'in-memory',
    `await page.goto(${JSON.stringify(`${baseURL}/app?tick=120`)});\nawait page.evaluate(() => { window.rprE2eBuilt = 'built'; });`
  );
  const script = moduleOf(
    'finds-it',
    "const built = await page.evaluate(() => window.rprE2eBuilt);\nif (built !== 'built') throw new Error(`not there: ${built}`);\nawait page.waitForTimeout(300);"
  );
  const result = await recordPage({ setup, script }, SESSIONS_DIR);
  expect(saved(result.id!).page.url).toContain('/app');
  // Given a url, the page opens again: the answer says what did not carry over.
  const reopened = await recordPage(
    { url: `${baseURL}/app?tick=120`, setup: moduleOf('elsewhere', `await page.goto(${JSON.stringify(`${baseURL}/`)});`) },
    SESSIONS_DIR
  );
  expect(reopened.warnings.join('\n')).toMatch(/state built in the page did not/);
});

test('a page that reloads itself is not blamed on the script', async ({ baseURL }) => {
  const script = moduleOf('reloads', 'await page.reload();');
  const failure = await recordPage({ url: `${baseURL}/app?tick=120`, script }, SESSIONS_DIR).catch((error: Error) => error);
  expect((failure as Error).message).toMatch(/reloaded itself at the url it was opened on/);
  fs.rmSync(/screenshot (\S+\.png)/.exec((failure as Error).message)?.[1] ?? '', { force: true });
});

test('collects the garbage before Stop, so what is still in memory is what something holds', async ({ baseURL }) => {
  const script = moduleOf(
    'leak',
    "await page.getByTestId('run').click(); await page.waitForFunction(() => document.querySelector('[data-testid=bar-fixed]')?.style.width === '100%');"
  );
  const result = await recordPage({ url: `${baseURL}/advanced/leak`, script }, SESSIONS_DIR);
  const retained = saved(result.id!).growth!.retained!;
  expect(retained.collected).toBe(true);
  expect(retained.components.find((c) => c.name === 'LeakyPopover')).toMatchObject({ unmounted: 5, retained: 5 });
  expect(retained.components.find((c) => c.name === 'TidyPopover')).toMatchObject({ unmounted: 5, retained: 0 });
});

test('with cpu, a render that is slow rather than frequent is named with the function inside it', async ({ baseURL }) => {
  // parseNotes runs in every render of NotesEager: the renders are as many as NotesLazy's, the time is not.
  const script = moduleOf(
    'init-renders',
    "for (let i = 0; i < 20; i++) { await page.getByTestId('render').first().click(); await page.waitForTimeout(20); }"
  );
  const result = await recordPage({ url: `${baseURL}/basics/init`, script, cpu: { raw: true } }, SESSIONS_DIR);
  expect(result.cpu).toMatch(/busy of/);
  const rec = saved(result.id!);
  expect(rec.conditions.cpu).toBe('sampled every 0.5ms');
  const cpu = rec.cpu!;
  expect(cpu.source).toBe('cdp');
  expect(cpu.renders[0]).toMatchObject({ name: 'NotesEager', site: expect.stringMatching(/Init\.tsx:\d+$/) });
  expect(cpu.renders[0].hot[0]).toMatchObject({ name: 'parseNotes', site: expect.stringMatching(/Init\.tsx:\d+$/) });
  expect(cpu.functions.find((f) => f.name === 'parseNotes')?.package).toBeUndefined();
  // A pre-bundled chunk is named by the package its source map points at, not left as chunk-XYZ.
  expect(cpu.packages.map((p) => p.name)).toContain('react-dom');
  // The driver's own scripts and the recorder's work are kept out of the page's lists.
  expect(cpu.functions.some((f) => f.package === '(evaluated)' || f.package === 'react-perf-recorder')).toBe(false);
  expect(fs.existsSync(path.join(SESSIONS_DIR, result.id!, 'cpu.cpuprofile'))).toBe(true);
});

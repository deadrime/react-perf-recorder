#!/usr/bin/env node
// One case's workspace: the chat app in ../app with one bug's patch from ../bugs applied, served by a dev server of
// the run so the agent's fix reloads in the page it records; its url is left in dev-url.txt. With
// --recorded=<wait|type|tabs> it also records that scenario as a person would from the panel, and leaves the
// recording's id in recording.txt.
//   node scaffold.mjs <bug id | none> [target dir] [--no-serve] [--recorded=<scenario>]
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../../..');
const [bug, target = '.'] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const recorded = process.argv.find((a) => a.startsWith('--recorded='))?.slice('--recorded='.length);
if (!bug) throw new Error('usage: scaffold.mjs <bug id | none> [target dir]');

// Written by run.sh: a scaffold runs without its EVAL_* variables.
const run = (() => {
  try {
    return JSON.parse(fs.readFileSync(path.join(repo, '.agent-artifacts/eval-run.json'), 'utf8'));
  } catch {
    return {};
  }
})();

const freePort = () =>
  new Promise((resolve) => {
    const server = net.createServer().listen(0, () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });

/** A dev server of this workspace, left running for the run; run.sh stops every one it finds in servers/. */
async function serve(dir) {
  const sessions = process.env.EVAL_RPR_DIR || run.sessions || fs.mkdtempSync(path.join(fs.realpathSync('/tmp'), 'rpr-eval-'));
  const port = await freePort();
  const log = fs.openSync(path.join(sessions, `dev-${port}.log`), 'a');
  const child = spawn(
    process.execPath,
    [path.join(repo, 'node_modules/vite/bin/vite.js'), '--config', path.join(repo, 'test/eval-plugin/workspace.vite.config.ts')],
    {
      cwd: repo,
      // NODE_ENV=production from the eval's environment would serve React's production JSX runtime: no jsxDEV, no app.
      env: { ...process.env, NODE_ENV: 'development', RPR_WORKSPACE: dir, RPR_PORT: String(port), RPR_SESSIONS: sessions },
      detached: true,
      stdio: ['ignore', log, log],
    }
  );
  child.unref();
  fs.mkdirSync(path.join(sessions, 'servers'), { recursive: true });
  fs.writeFileSync(path.join(sessions, 'servers', String(child.pid)), dir);
  const url = `http://localhost:${port}/`;
  for (let i = 0; i < 120; i++) {
    if (
      await fetch(url).then(
        (r) => r.ok,
        () => false
      )
    )
      break;
    await new Promise((r) => setTimeout(r, 500));
  }
  await warm(url, dir);
  fs.writeFileSync(path.join(dir, 'dev-url.txt'), `${url}?tick=150\n`);
}

/**
 * The page opened once before the agent does: Vite pre-bundles what a first visit finds and reloads the page, which
 * would otherwise land in the agent's first recording and end it ("dev root not found").
 */
async function warm(url, dir) {
  // A scaffold runs with HOME moved, like the agent: the browsers' folder comes from run.sh.
  const browsers = process.env.EVAL_PLAYWRIGHT_BROWSERS_PATH || run.browsers || process.env.PLAYWRIGHT_BROWSERS_PATH;
  const build =
    browsers && fs.existsSync(browsers)
      ? fs
          .readdirSync(browsers)
          .filter((d) => /^chromium-\d+$/.test(d))
          .sort()
          .pop()
      : undefined;
  const executablePath = build && path.join(browsers, build, 'chrome-linux/chrome');
  const { chromium } = createRequire(path.join(repo, 'package.json'))('playwright');
  const browser = await chromium
    .launch({ headless: true, ...(executablePath && fs.existsSync(executablePath) ? { executablePath } : {}) })
    .catch((error) => console.error(`no warm-up, the first recording may meet a reload: ${String(error.message).split('\n')[0]}`));
  if (!browser) return;
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    for (let i = 0; i < 2; i++) {
      await page.goto(url, { waitUntil: 'networkidle' });
      await page.waitForTimeout(1500);
    }
    const rendered = await page.evaluate(() => (document.getElementById('root')?.childElementCount ?? 0) > 0);
    if (!rendered) console.error(`the app did not render at ${url}: ${errors.slice(0, 3).join('; ') || 'no page error'}`);
    if (recorded) await record(page, `${url}?tick=150`, dir);
  } finally {
    await browser.close();
  }
}

// The person's steps, as the e2e tests of the fixture run them.
const SCENARIOS = {
  wait: (page) => page.waitForTimeout(5000),
  type: (page) => page.getByTestId('message').pressSequentially('see you at five', { delay: 90 }),
  tabs: async (page) => {
    for (let i = 0; i < 3; i++) {
      await page.getByTestId('tab-people').click();
      await page.getByTestId('tab-chat').click();
    }
  },
};

/** Rec, the steps, Stop — as from the panel; the dev server saves it in the run's sessions folder. */
async function record(page, url, dir) {
  if (!SCENARIOS[recorded]) throw new Error(`no scenario ${recorded}`);
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.getByTestId('unread').waitFor();
  await page.waitForTimeout(500);
  await page.evaluate(() => window.__REACT_PERF_RECORDER__.engine.start({ source: 'panel', highlight: false }));
  await SCENARIOS[recorded](page);
  const { id } = await page.evaluate(() => window.__REACT_PERF_RECORDER__.engine.stop());
  if (!id) throw new Error('the recording has no id: the dev server did not save it');
  fs.writeFileSync(path.join(dir, 'recording.txt'), `${id}\n`);
}

const dir = path.resolve(target);
fs.cpSync(path.join(here, '../app'), dir, { recursive: true });
// patch, not git apply: inside a repository git reads the patch's paths from its root.
if (bug !== 'none')
  execFileSync('patch', ['-p1', '--forward', '--batch', '--quiet', '-d', dir, '-i', path.join(here, '../bugs', `${bug}.patch`)], {
    stdio: 'inherit',
  });
if (!fs.existsSync(path.join(dir, 'node_modules'))) fs.symlinkSync(path.join(repo, 'node_modules'), path.join(dir, 'node_modules'), 'dir');
if (!process.argv.includes('--no-serve')) await serve(dir);

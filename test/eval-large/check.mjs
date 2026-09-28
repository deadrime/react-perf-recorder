#!/usr/bin/env node
// Every bug of the large app recorded as a person would see it, next to the clean app doing the same: the bug's waste
// must stand well above the clean app's, its component must be among the recording's first roots, and the page must
// still work. One Vite serves every workspace under a path of its own; one Chromium records them.
//   npm run build && node test/eval-large/check.mjs [bug…]
import { execFile, execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { BUGS } from './cases.mjs';
import { launchChromium, recordScenario } from './scenarios.mjs';

const run$ = promisify(execFile);
const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../..');
const only = process.argv.slice(2);
const bugs = Object.entries(BUGS).filter(([name]) => !only.length || only.includes(name));

const sessions = fs.mkdtempSync(path.join(os.tmpdir(), 'rpr-large-sessions-'));
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rpr-large-root-'));
fs.symlinkSync(path.join(repo, 'node_modules'), path.join(root, 'node_modules'), 'dir');

/** The app with some bugs patched in, as a folder of the shared root. */
function workspace(name, patches) {
  const dir = path.join(root, name);
  fs.cpSync(path.join(here, 'app'), dir, { recursive: true });
  for (const patch of patches)
    execFileSync('patch', ['-p1', '--forward', '--batch', '--quiet', '-d', dir, '-i', path.join(here, 'bugs', `${patch}.patch`)]);
  const html = path.join(dir, 'index.html');
  fs.writeFileSync(html, fs.readFileSync(html, 'utf8').replace('src="/src/main.tsx"', 'src="./src/main.tsx"'));
  return name;
}

const port = await new Promise((resolve) => {
  const probe = net.createServer().listen(0, () => {
    const { port } = probe.address();
    probe.close(() => resolve(port));
  });
});
const server = spawn(process.execPath, [path.join(repo, 'node_modules/vite/bin/vite.js'), '--config', path.join(here, 'vite.config.ts')], {
  cwd: repo,
  env: { ...process.env, NODE_ENV: 'development', RPR_WORKSPACE: root, RPR_PORT: String(port), RPR_SESSIONS: sessions, RPR_SHARED: '1' },
  stdio: ['ignore', 'ignore', 'inherit'],
});
const cleanup = () => {
  server.kill();
  fs.rmSync(root, { recursive: true, force: true });
  fs.rmSync(sessions, { recursive: true, force: true });
};
process.on('exit', cleanup);
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => process.exit(1));
const base = (name) => `http://localhost:${port}/${name}/?tick=150`;
for (
  let i = 0;
  i < 120 &&
  !(await fetch(`http://localhost:${port}/`).then(
    (r) => r.status < 500,
    () => false
  ));
  i++
)
  await new Promise((r) => setTimeout(r, 500));

const browser = await launchChromium(repo, process.env.PLAYWRIGHT_BROWSERS_PATH);

/** One recording of a scenario on a workspace, in a context of its own; a reload from Vite gets one more try. */
async function record(name, scenario) {
  for (let attempt = 0; ; attempt++) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    try {
      const page = await context.newPage();
      const result = await recordScenario(page, base(name), scenario);
      const { stdout } = await run$(process.execPath, [path.join(repo, 'dist/cli.js'), 'show', result.id, '--dir', sessions], { maxBuffer: 1 << 26 });
      return { ...result, show: JSON.parse(stdout) };
    } catch (error) {
      if (attempt) throw error;
    } finally {
      await context.close();
    }
  }
}

// The clean app opened once first: Vite bundles the dependencies on the first visit.
{
  workspace('clean', []);
  const page = await browser.newPage();
  await page.goto(`${base('clean')}#/issues`, { waitUntil: 'load' });
  await page.getByTestId('issue-row').first().waitFor({ timeout: 60_000 });
  await page.close();
}

let failed = 0;
const cleanRuns = {};
for (const [name, bug] of bugs) {
  try {
    workspace(name, bug.patches ?? [name]);
    cleanRuns[bug.scenario] ??= await record('clean', bug.scenario);
    const clean = cleanRuns[bug.scenario];
    const buggy = await record(name, bug.scenario);
    const waste = { bug: bug.waste(buggy.show), clean: bug.waste(clean.show) };
    const roots = buggy.show.topRoots.slice(0, 3).map((r) => r.root);
    const shown = bug.root === null || (bug.shown ? bug.shown(buggy.show) : roots.includes(bug.root));
    const works = !clean.missing.length && clean.typedOk;
    // The bug has to cost at least twice what the clean app spends on the same measure, and be visible to the person.
    const stands = bug.root === null ? waste.bug <= waste.clean * 1.25 + 3 : waste.bug >= Math.max(2 * waste.clean, waste.clean + 3);
    const visible = bug.visible ? !buggy.missing.length && buggy.typedOk === false : true;
    const ok = shown && stands && works && visible;
    if (!ok) failed++;
    console.log(
      `${ok ? '✓' : '✗'} ${name.padEnd(22)} ${bug.scenario.padEnd(14)} waste ${waste.bug} vs clean ${waste.clean} | ${buggy.show.topRoots
        .slice(0, 3)
        .map((r) => `${r.root} ×${r.hits}${r.mounts ? ` +${r.mounts}` : ''}${r.renderMsPerHit >= 3 ? ` ${r.renderMsPerHit} ms` : ''}`)
        .join(', ')}${works ? '' : ` | the clean app broke: ${JSON.stringify({ missing: clean.missing, typed: clean.typed })}`}${
        bug.visible && !visible ? ' | the bug is not visible in the page' : ''
      }`
    );
  } catch (error) {
    failed++;
    console.log(`✗ ${name}: ${String(error.message).split('\n')[0]}`);
  }
}
await browser.close();
process.exit(failed ? 1 : 0);

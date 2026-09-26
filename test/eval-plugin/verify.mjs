#!/usr/bin/env node
// Whether each run's fix worked, from the result rather than the diff: the source an agent left (kept by
// `claude plugin eval --keep-temp`) is served and recorded with its case's scenario, and its waste is set against the
// bug's and the clean app's. A fix counts when at least 3/4 of the waste is gone and the page still works: every part
// of it is there and what the scenario typed is in the box. Writes verify.json next to the run's result.
// One dev server serves every workspace, each under a path of its own, so the dependencies are bundled once; one
// Chromium records them, VERIFY_JOBS pages at a time (4 by default).
//   node test/eval-plugin/verify.mjs <aggregate-result.json>
//   node test/eval-plugin/verify.mjs --self-test     the bug left as it is must fail, the clean app must pass
import { execFile, execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { CASES } from './cases.mjs';
import { TYPED, launchChromium, recordScenario } from './scenarios.mjs';

const run$ = promisify(execFile);
const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../..');
const GONE = 0.75;
const JOBS = Math.max(1, Number(process.env.VERIFY_JOBS) || 4);

const sessions = fs.mkdtempSync(path.join(os.tmpdir(), 'rpr-verify-'));
// Every workspace is a folder here; the one node_modules above them resolves all their imports to the same copies.
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rpr-verify-root-'));
fs.symlinkSync(path.join(repo, 'node_modules'), path.join(root, 'node_modules'), 'dir');

const port = await new Promise((resolve) => {
  const probe = net.createServer().listen(0, () => {
    const { port } = probe.address();
    probe.close(() => resolve(port));
  });
});
const server = spawn(process.execPath, [path.join(repo, 'node_modules/vite/bin/vite.js'), '--config', path.join(here, 'workspace.vite.config.ts')], {
  cwd: repo,
  env: { ...process.env, NODE_ENV: 'development', RPR_WORKSPACE: root, RPR_PORT: String(port), RPR_SESSIONS: sessions, RPR_SHARED: '1' },
  stdio: ['ignore', 'ignore', 'inherit'],
});
const browser = await launchChromium(repo, process.env.PLAYWRIGHT_BROWSERS_PATH);
const cleanup = () => {
  server.kill();
  fs.rmSync(root, { recursive: true, force: true });
  fs.rmSync(sessions, { recursive: true, force: true });
};
process.on('exit', cleanup);
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => process.exit(1));
const base = `http://localhost:${port}`;
for (
  let i = 0;
  i < 120 &&
  !(await fetch(`${base}/`).then(
    (r) => r.status < 500,
    () => false
  ));
  i++
)
  await new Promise((r) => setTimeout(r, 500));

let workspaces = 0;
/** A folder of the shared root: the app with the bugs patched in, or with the source an agent left. */
function workspace({ bugs = 'none', from }) {
  const dir = path.join(root, `w${++workspaces}`);
  fs.cpSync(path.join(here, 'app'), dir, { recursive: true });
  if (from) {
    fs.rmSync(path.join(dir, 'src'), { recursive: true });
    fs.cpSync(path.join(from, 'src'), path.join(dir, 'src'), { recursive: true });
  } else
    for (const bug of bugs === 'none' ? [] : bugs.split(','))
      execFileSync('patch', ['-p1', '--forward', '--batch', '--quiet', '-d', dir, '-i', path.join(here, 'bugs', `${bug}.patch`)]);
  // Served under /w<n>/, the entry is found next to the page rather than at the server's root.
  const html = path.join(dir, 'index.html');
  fs.writeFileSync(html, fs.readFileSync(html, 'utf8').replace('src="/src/main.tsx"', 'src="./src/main.tsx"'));
  return dir;
}

/** The clean app opened once before the pool starts: Vite bundles the dependencies on the first visit and reloads. */
{
  const dir = workspace({});
  const page = await browser.newPage();
  for (let i = 0; i < 2; i++) {
    await page.goto(`${base}/${path.basename(dir)}/?tick=150`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
  }
  await page.close();
  fs.rmSync(dir, { recursive: true, force: true });
}

/** At most JOBS of these at once. */
let running = 0;
const waiting = [];
async function slot(task) {
  if (running >= JOBS) await new Promise((resolve) => waiting.push(resolve));
  running++;
  try {
    return await task();
  } finally {
    running--;
    waiting.shift()?.();
  }
}

function scaffoldOf(name) {
  const script = fs.readFileSync(path.join(here, 'evals', name, 'scaffold.sh'), 'utf8');
  return { bugs: /scaffold\.mjs" ([\w,-]+)/.exec(script)[1], scenario: /--recorded=(\w+)/.exec(script)?.[1] ?? 'type' };
}

/** One recording of a case's scenario on a workspace, in a context of its own. */
async function recordOnce(name, dir) {
  const { scenario } = scaffoldOf(name);
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    const url = `${base}/${path.basename(dir)}/?tick=150`;
    // A first visit transforms the workspace's own files; the recording is the second.
    await page.goto(url, { waitUntil: 'networkidle' });
    const result = await recordScenario(page, url, scenario);
    const { stdout } = await run$(process.execPath, [path.join(repo, 'dist/cli.js'), 'show', result.id, '--dir', sessions], {
      maxBuffer: 64 * 1024 * 1024,
    });
    const typed = TYPED[scenario];
    return {
      waste: CASES[name].waste(JSON.parse(stdout)),
      works: result.missing.length === 0 && (typed === undefined || result.typed === typed),
      missing: result.missing,
      typed: result.typed,
    };
  } finally {
    await context.close();
  }
}

/** A recording of the scenario on the bug, the clean app or what an agent left; a failed one is tried once more. */
const record = (name, source = {}) =>
  slot(async () => {
    const dir = workspace(source);
    try {
      try {
        return await recordOnce(name, dir);
      } catch {
        // A page reload from Vite finding a dependency it had not bundled ends a recording; the second try has it.
        return await recordOnce(name, dir);
      }
    } catch (error) {
      return { waste: null, works: false, error: String(error.message).split('\n')[0] };
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

const baselines = {};
/** The bug's and the clean app's recordings of a case, made once and shared by all its runs. */
function baseline(name) {
  baselines[name] ??= Promise.all([record(name, { bugs: scaffoldOf(name).bugs }), record(name)]).then(([bug, clean]) => {
    console.log(
      `  ${name}: waste ${bug.waste} with the bug, ${clean.waste} on the clean app${[bug.error, clean.error]
        .filter(Boolean)
        .map((e) => ` — ${e}`)
        .join('')}`
    );
    return { bug: bug.waste, clean: clean.waste, records: { bug, clean } };
  });
  return baselines[name];
}

/** Fixed: the page works and the waste is down to the clean app's, give or take a quarter of what the bug added. */
async function judge(name, after) {
  const { bug, clean } = await baseline(name);
  if (!after.works || after.waste === null) return false;
  const allowed = name === 'no-bug-rec' ? clean + Math.max(3, clean * 0.25) : clean + (1 - GONE) * (bug - clean);
  return after.waste <= allowed;
}

async function selfTest() {
  const results = await Promise.all(
    Object.keys(CASES).map(async (name) => {
      const { records } = await baseline(name);
      const clean = await judge(name, records.clean);
      const left = scaffoldOf(name).bugs === 'none' ? true : !(await judge(name, records.bug));
      console.log(
        `${clean && left ? '✓' : '✗'} ${name}: the clean app ${clean ? 'passes' : 'FAILS'}, the bug left as it is ${left ? 'fails' : 'PASSES'}`
      );
      return clean && left;
    })
  );
  return results.every(Boolean);
}

async function verify(input) {
  const result = JSON.parse(fs.readFileSync(input, 'utf8'));
  const out = { cases: {} };
  await Promise.all(
    result.cases
      .filter((c) => CASES[c.name])
      .map(async (c) => {
        const entry = {};
        // A run without the baseline arm (--ablation none) has only `with`.
        for (const side of ['with', 'without'].filter((side) => c.arms[side]))
          entry[side] = c.arms[side].map(async (r) => {
            // The run's sandbox: out/trace.jsonl, and the workspace the agent worked in at home/cwd.
            const from = r.tracePath && path.join(path.dirname(path.dirname(r.tracePath)), 'home/cwd');
            if (!from || !fs.existsSync(path.join(from, 'src'))) return { fixed: null, error: 'no workspace kept' };
            const after = await record(c.name, { from });
            const fixed = await judge(c.name, after);
            const broken = after.works ? '' : ` — broken: ${after.error ?? JSON.stringify({ missing: after.missing, typed: after.typed })}`;
            console.log(`${fixed ? '✓' : '✗'} ${c.name} [${side}] waste ${after.waste}${broken}`);
            return { fixed, ...after };
          });
        const { bug, clean } = await baseline(c.name);
        out.cases[c.name] = { baseline: { bug, clean } };
        for (const [side, runs] of Object.entries(entry)) out.cases[c.name][side] = await Promise.all(runs);
      })
  );
  // The cases in the run's order, as summarize.mjs and the eye read them.
  const ordered = { cases: {} };
  for (const c of result.cases) if (out.cases[c.name]) ordered.cases[c.name] = out.cases[c.name];
  fs.writeFileSync(path.join(path.dirname(input), 'verify.json'), JSON.stringify(ordered, null, 2));
}

let ok = true;
try {
  if (process.argv.includes('--self-test')) ok = await selfTest();
  else {
    const input = process.argv[2];
    if (!input) throw new Error('usage: verify.mjs <aggregate-result.json> | --self-test');
    await verify(input);
  }
} finally {
  await browser.close();
}
process.exit(ok ? 0 : 1);

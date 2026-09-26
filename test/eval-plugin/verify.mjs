#!/usr/bin/env node
// Whether each run's fix worked, from the result rather than the diff: the source an agent left (kept by
// `claude plugin eval --keep-temp`) is served and recorded with its case's scenario, and its waste is set against the
// bug's and the clean app's. A fix counts when at least 3/4 of the waste is gone and the page still works: every part
// of it is there and what the scenario typed is in the box. Writes verify.json next to the run's result.
//   node test/eval-plugin/verify.mjs <aggregate-result.json>
//   node test/eval-plugin/verify.mjs --self-test     the bug left as it is must fail, the clean app must pass
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CASES, TYPED } from './cases.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../..');
const GONE = 0.75;

const sessions = fs.mkdtempSync(path.join(os.tmpdir(), 'rpr-verify-'));
const runFile = path.join(repo, '.agent-artifacts/eval-run.json');
fs.mkdirSync(path.dirname(runFile), { recursive: true });
fs.writeFileSync(runFile, JSON.stringify({ sessions, browsers: process.env.PLAYWRIGHT_BROWSERS_PATH }));
const stop = () => {
  for (const pid of fs.existsSync(path.join(sessions, 'servers')) ? fs.readdirSync(path.join(sessions, 'servers')) : []) {
    try {
      process.kill(Number(pid));
    } catch {}
    fs.rmSync(path.join(sessions, 'servers', pid), { force: true });
  }
};
process.on('exit', () => {
  stop();
  fs.rmSync(sessions, { recursive: true, force: true });
});

function scaffoldOf(name) {
  const script = fs.readFileSync(path.join(here, 'evals', name, 'scaffold.sh'), 'utf8');
  return { bugs: /scaffold\.mjs" ([\w,-]+)/.exec(script)[1], scenario: /--recorded=(\w+)/.exec(script)?.[1] ?? 'type' };
}

/** A recording of the scenario on a workspace: the bug patched in, the clean app, or the source an agent left. */
function record(name, { bugs = 'none', from } = {}) {
  const { scenario } = scaffoldOf(name);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rpr-verify-ws-'));
  try {
    execFileSync(
      process.execPath,
      [path.join(here, 'evals/scaffold.mjs'), bugs, dir, `--recorded=${scenario}`, ...(from ? [`--from=${from}`] : [])],
      {
        stdio: ['ignore', 'ignore', 'inherit'],
      }
    );
    const result = JSON.parse(fs.readFileSync(path.join(dir, 'recording.json'), 'utf8'));
    const show = JSON.parse(
      execFileSync(process.execPath, [path.join(repo, 'dist/cli.js'), 'show', result.id, '--dir', sessions], { encoding: 'utf8' })
    );
    const typed = TYPED[scenario];
    return {
      waste: CASES[name].waste(show),
      works: result.missing.length === 0 && (typed === undefined || result.typed === typed),
      missing: result.missing,
      typed: result.typed,
    };
  } catch (error) {
    return { waste: null, works: false, error: String(error.message).split('\n')[0] };
  } finally {
    stop();
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

const baselines = {};
function baseline(name) {
  if (!baselines[name]) {
    const clean = record(name);
    const bug = record(name, { bugs: scaffoldOf(name).bugs });
    baselines[name] = { bug: bug.waste, clean: clean.waste, records: { bug, clean } };
    console.log(`  ${name}: waste ${bug.waste} with the bug, ${clean.waste} on the clean app`);
  }
  return baselines[name];
}

/** Fixed: the page works and the waste is down to the clean app's, give or take a quarter of what the bug added. */
function judge(name, after) {
  const { bug, clean } = baseline(name);
  if (!after.works || after.waste === null) return false;
  const allowed = name === 'no-bug-rec' ? clean + Math.max(3, clean * 0.25) : clean + (1 - GONE) * (bug - clean);
  return after.waste <= allowed;
}

if (process.argv.includes('--self-test')) {
  let failed = 0;
  for (const name of Object.keys(CASES)) {
    const { records } = baseline(name);
    const clean = judge(name, records.clean);
    const left = scaffoldOf(name).bugs === 'none' ? true : !judge(name, records.bug);
    const ok = clean && left;
    if (!ok) failed++;
    console.log(`${ok ? '✓' : '✗'} ${name}: the clean app ${clean ? 'passes' : 'FAILS'}, the bug left as it is ${left ? 'fails' : 'PASSES'}`);
  }
  process.exit(failed ? 1 : 0);
}

const input = process.argv[2];
if (!input) throw new Error('usage: verify.mjs <aggregate-result.json> | --self-test');
const run = JSON.parse(fs.readFileSync(input, 'utf8'));
const out = { cases: {} };
for (const c of run.cases) {
  if (!CASES[c.name]) continue;
  const { bug, clean } = baseline(c.name);
  out.cases[c.name] = { baseline: { bug, clean } };
  for (const side of ['with', 'without']) {
    out.cases[c.name][side] = c.arms[side].map((r) => {
      // The run's sandbox: out/trace.jsonl, and the workspace the agent worked in at home/cwd.
      const workspace = r.tracePath && path.join(path.dirname(path.dirname(r.tracePath)), 'home/cwd');
      if (!workspace || !fs.existsSync(path.join(workspace, 'src'))) return { fixed: null, error: 'no workspace kept' };
      const after = record(c.name, { from: workspace });
      const fixed = judge(c.name, after);
      console.log(
        `${fixed ? '✓' : '✗'} ${c.name} [${side}] waste ${after.waste}${
          after.works ? '' : ` — broken: ${after.error ?? JSON.stringify({ missing: after.missing, typed: after.typed })}`
        }`
      );
      return { fixed, ...after };
    });
  }
}
fs.writeFileSync(path.join(path.dirname(input), 'verify.json'), JSON.stringify(out, null, 2));

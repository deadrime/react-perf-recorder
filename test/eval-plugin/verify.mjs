#!/usr/bin/env node
// Whether each run's fix worked, from the result rather than the diff: the source an agent left (kept by
// `claude plugin eval --keep-temp`) is served and recorded with its case's scenario, and its waste is set against the
// bug's and the clean app's. A fix counts when at least 3/4 of the waste is gone and the page still works: every part
// of it is there and what the scenario typed is in the box. Writes verify.json next to the run's result.
// Recordings run VERIFY_JOBS at a time (4 by default), each on a dev server of its own.
//   node test/eval-plugin/verify.mjs <aggregate-result.json>
//   node test/eval-plugin/verify.mjs --self-test     the bug left as it is must fail, the clean app must pass
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { CASES, TYPED } from './cases.mjs';

const run$ = promisify(execFile);
const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../..');
const GONE = 0.75;
const JOBS = Math.max(1, Number(process.env.VERIFY_JOBS) || 4);

const sessions = fs.mkdtempSync(path.join(os.tmpdir(), 'rpr-verify-'));
const servers = path.join(sessions, 'servers');
const runFile = path.join(repo, '.agent-artifacts/eval-run.json');
fs.mkdirSync(path.dirname(runFile), { recursive: true });
fs.writeFileSync(runFile, JSON.stringify({ sessions, browsers: process.env.PLAYWRIGHT_BROWSERS_PATH }));

/** Stops the dev servers the scaffold started for `dir` — each pid file holds its workspace — or all of them. */
const stop = (dir) => {
  for (const pid of fs.existsSync(servers) ? fs.readdirSync(servers) : []) {
    const file = path.join(servers, pid);
    if (dir && fs.readFileSync(file, 'utf8') !== dir) continue;
    try {
      process.kill(Number(pid));
    } catch {}
    fs.rmSync(file, { force: true });
  }
};
process.on('exit', () => {
  stop();
  fs.rmSync(sessions, { recursive: true, force: true });
});

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

/** A recording of the scenario on a workspace: the bug patched in, the clean app, or the source an agent left. */
const record = (name, { bugs = 'none', from } = {}) =>
  slot(async () => {
    const { scenario } = scaffoldOf(name);
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rpr-verify-ws-'));
    try {
      await run$(process.execPath, [path.join(here, 'evals/scaffold.mjs'), bugs, dir, `--recorded=${scenario}`, ...(from ? [`--from=${from}`] : [])]);
      const result = JSON.parse(fs.readFileSync(path.join(dir, 'recording.json'), 'utf8'));
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
    } catch (error) {
      return { waste: null, works: false, error: String(error.message).split('\n')[0] };
    } finally {
      stop(dir);
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

const baselines = {};
/** The bug's and the clean app's recordings of a case, made once and shared by all its runs. */
function baseline(name) {
  baselines[name] ??= Promise.all([record(name, { bugs: scaffoldOf(name).bugs }), record(name)]).then(([bug, clean]) => {
    console.log(`  ${name}: waste ${bug.waste} with the bug, ${clean.waste} on the clean app`);
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

if (process.argv.includes('--self-test')) {
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
  process.exit(results.every(Boolean) ? 0 : 1);
}

const input = process.argv[2];
if (!input) throw new Error('usage: verify.mjs <aggregate-result.json> | --self-test');
const result = JSON.parse(fs.readFileSync(input, 'utf8'));
const out = { cases: {} };
await Promise.all(
  result.cases
    .filter((c) => CASES[c.name])
    .map(async (c) => {
      const entry = (out.cases[c.name] = {});
      // A run without the baseline arm (--ablation none) has only `with`.
      const sides = ['with', 'without'].filter((side) => c.arms[side]);
      await Promise.all(
        sides.map(async (side) => {
          entry[side] = await Promise.all(
            c.arms[side].map(async (r) => {
              // The run's sandbox: out/trace.jsonl, and the workspace the agent worked in at home/cwd.
              const workspace = r.tracePath && path.join(path.dirname(path.dirname(r.tracePath)), 'home/cwd');
              if (!workspace || !fs.existsSync(path.join(workspace, 'src'))) return { fixed: null, error: 'no workspace kept' };
              const after = await record(c.name, { from: workspace });
              const fixed = await judge(c.name, after);
              console.log(
                `${fixed ? '✓' : '✗'} ${c.name} [${side}] waste ${after.waste}${
                  after.works ? '' : ` — broken: ${after.error ?? JSON.stringify({ missing: after.missing, typed: after.typed })}`
                }`
              );
              return { fixed, ...after };
            })
          );
        })
      );
      const { bug, clean } = await baseline(c.name);
      entry.baseline = { bug, clean };
    })
);
// The cases in the run's order, each with its baseline first, as summarize.mjs and the eye read them.
const ordered = { cases: {} };
for (const c of result.cases) if (out.cases[c.name]) ordered.cases[c.name] = { baseline: out.cases[c.name].baseline, ...out.cases[c.name] };
fs.writeFileSync(path.join(path.dirname(input), 'verify.json'), JSON.stringify(ordered, null, 2));

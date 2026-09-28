#!/usr/bin/env node
// Every run of a `claude plugin eval` result as a transcript to read later: what the agent called and saw, its
// answer, the verdicts, and the diff it left against the case's source. One markdown file per run and an index, in
// .agent-artifacts/transcripts/<run's start> unless --out says otherwise. --publish then commits that folder to the
// `benchmarks` branch, which holds only transcripts, and pushes it; a folder written before can be published alone.
//   node test/eval-plugin/transcripts.mjs .agent-artifacts/evals/aggregate-result.json [--out <dir>] [--publish]
//   node test/eval-plugin/transcripts.mjs .agent-artifacts/transcripts/2026-09-28T00-08 --publish
// Needs the sandboxes `run.sh --keep-temp` left; run it after verify.mjs to have its verdicts in.
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../..');
const args = process.argv.slice(2);
const input = args.find((a) => !a.startsWith('--') && args[args.indexOf(a) - 1] !== '--out');
const outIndex = args.indexOf('--out');
if (!input) throw new Error('usage: transcripts.mjs <aggregate-result.json | transcripts dir> [--out <dir>] [--publish]');
const BRANCH = 'benchmarks';
const git = (cwd, ...a) => execFileSync('git', a, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] }).trim();

/** Commits a folder of transcripts to the transcripts branch as transcripts/<folder's name> and pushes it. */
function publish(dir) {
  const id = path.basename(dir);
  const parent = spawnSync('git', ['fetch', '-q', 'origin', BRANCH], { cwd: repo }).status === 0 && git(repo, 'rev-parse', 'FETCH_HEAD');
  const wt = fs.mkdtempSync(path.join(os.tmpdir(), 'rpr-benchmarks-'));
  try {
    // A branch of its own history: a worktree off it, or an empty one the first time, so dev's files never get in.
    if (parent) git(repo, 'worktree', 'add', '-q', '--detach', wt, parent);
    else {
      git(repo, 'worktree', 'add', '-q', '--detach', '--no-checkout', wt);
      git(wt, 'read-tree', '--empty');
    }
    const target = path.join(wt, 'transcripts', id);
    fs.rmSync(target, { recursive: true, force: true });
    fs.cpSync(dir, target, { recursive: true });
    const runs = fs
      .readdirSync(path.join(wt, 'transcripts'))
      .sort()
      .reverse()
      .map((name) => {
        const about = fs.readFileSync(path.join(wt, 'transcripts', name, 'README.md'), 'utf8').split('\n')[2] ?? '';
        return `- [${name}](transcripts/${name}/README.md): ${about.split(':')[0]}`;
      });
    fs.writeFileSync(
      path.join(wt, 'README.md'),
      [
        '# Benchmark transcripts',
        '',
        "Every run of the agent benchmark, one folder a run, newest first: each file is one agent's prompt, answer, the diff it left and its steps. Written by `test/eval-plugin/transcripts.mjs --publish`; the benchmark itself and its numbers are `docs/benchmarks.md` on `dev` and `main`.",
        '',
        ...runs,
        '',
      ].join('\n')
    );
    git(wt, 'add', '-A');
    const tree = git(wt, 'write-tree');
    const count = fs.readdirSync(target).filter((f) => f !== 'README.md').length;
    const commit = git(wt, 'commit-tree', tree, ...(parent ? ['-p', parent] : []), '-m', `docs(benchmarks): transcripts of ${count} runs, ${id}`);
    git(repo, 'push', '-q', 'origin', `${commit}:refs/heads/${BRANCH}`);
    console.log(`published to ${BRANCH} as transcripts/${id}`);
  } finally {
    spawnSync('git', ['worktree', 'remove', '--force', wt], { cwd: repo });
    fs.rmSync(wt, { recursive: true, force: true });
  }
}

if (fs.statSync(input).isDirectory()) {
  if (!args.includes('--publish')) throw new Error(`${input} is a folder of transcripts already: add --publish to publish it`);
  publish(path.resolve(input));
  process.exit(0);
}
const run = JSON.parse(fs.readFileSync(input, 'utf8'));
const out = path.resolve(
  outIndex >= 0 ? args[outIndex + 1] : path.join(repo, '.agent-artifacts/transcripts', run.startedAt.slice(0, 16).replace(':', '-'))
);
const verified = (() => {
  try {
    return JSON.parse(fs.readFileSync(path.join(path.dirname(input), 'verify.json'), 'utf8')).cases;
  } catch {
    return null;
  }
})();

// A tool's answer is cut: the recording's summary alone runs to 20 KB, and the call before it says what was asked.
const CALL = 600;
const RESULT = 1500;
const cut = (text, max) => (text.length > max ? `${text.slice(0, max)} … [${text.length - max} more]` : text);
const fence = (text) => {
  const ticks = '`'.repeat(Math.max(3, ...[...text.matchAll(/`+/g)].map((m) => m[0].length + 1)));
  return `${ticks}\n${text}\n${ticks}`;
};
const textOf = (content) =>
  typeof content === 'string'
    ? content
    : (content ?? [])
        .map((part) => (part.type === 'text' ? part.text : part.type === 'tool_reference' ? part.tool_name : `[${part.type}]`))
        .join('\n');
// The sandbox's paths are long and differ per run; the workspace is what the agent calls "here".
const local = (text, cwd) =>
  (cwd
    ? text
        .split(cwd + '/')
        .join('')
        .split(cwd)
        .join('.')
    : text
  )
    .split(repo + '/')
    .join('');

/** The steps of one run, from the stream-json trace: text, tool calls and their answers; the subagent's indented. */
function steps(trace, cwd) {
  const lines = [];
  let result = null;
  for (const raw of fs.readFileSync(trace, 'utf8').split('\n')) {
    if (!raw.trim()) continue;
    let event;
    try {
      event = JSON.parse(raw);
    } catch {
      continue;
    }
    if (event.type === 'result') result = event;
    if (event.type !== 'assistant' && event.type !== 'user') continue;
    const who = event.parent_tool_use_id ? '> ' : '';
    const content = typeof event.message.content === 'string' ? [{ type: 'text', text: event.message.content }] : event.message.content;
    for (const block of content) {
      if (block.type === 'text' && block.text.trim()) {
        // The skill's body comes back as a user message: it is the same every run, so only its first line stays.
        const text = event.type === 'user' ? cut(block.text, 200) : block.text;
        lines.push(`${who}**${event.type === 'user' ? 'input' : 'agent'}:** ${local(text, cwd).replace(/\n/g, `\n${who}`)}`, '');
      } else if (block.type === 'tool_use') {
        lines.push(`${who}**→ ${block.name.replace(/^mcp__plugin_react-perf-recorder_react-perf-recorder__/, 'rpr:')}**`);
        lines.push(`${who}${fence(local(cut(JSON.stringify(block.input), CALL), cwd)).replace(/\n/g, `\n${who}`)}`, '');
      } else if (block.type === 'tool_result') {
        const text = local(cut(textOf(block.content), RESULT), cwd);
        lines.push(`${who}${block.is_error ? '**✗ error**' : '**←**'}`);
        lines.push(`${who}${fence(text).replace(/\n/g, `\n${who}`)}`, '');
      }
    }
  }
  return { lines, result };
}

/** What the agent changed: its workspace against the case's source, rebuilt by the case's own scaffold. */
function diff(caseDir, cwd) {
  const scaffold = fs.readFileSync(path.join(caseDir, 'scaffold.sh'), 'utf8');
  const bugs = /scaffold\.mjs"?\s+(\S+)/.exec(scaffold)?.[1];
  if (!bugs || !fs.existsSync(path.join(cwd, 'src'))) return null;
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'rpr-transcript-'));
  try {
    execFileSync(process.execPath, [path.join(here, 'evals/scaffold.mjs'), bugs, base, '--no-serve'], { stdio: 'ignore' });
    // a/src and b/src side by side, so the diff's paths read as the agent saw them.
    const pair = path.join(base, '.pair');
    for (const [side, src] of [
      ['a', path.join(base, 'src')],
      ['b', path.join(cwd, 'src')],
    ]) {
      fs.mkdirSync(path.join(pair, side), { recursive: true });
      fs.symlinkSync(src, path.join(pair, side, 'src'));
    }
    const { stdout } = spawnSync('diff', ['-ruN', 'a/src', 'b/src'], { encoding: 'utf8', cwd: pair });
    return stdout.replace(/^(---|\+\+\+) (\S+)\t.*$/gm, '$1 $2');
  } finally {
    fs.rmSync(base, { recursive: true, force: true });
  }
}

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
const index = [];
for (const c of run.cases) {
  for (const [side, runs] of Object.entries(c.arms)) {
    runs.forEach((r, i) => {
      const name = `${c.name}.${side}.${i + 1}.md`;
      const verdict = verified?.[c.name]?.[side]?.[i];
      const fixed = verdict?.fixed === true ? 'fixed' : verdict?.fixed === false ? 'not fixed' : 'not verified';
      const failed = r.graders.filter((g) => g.scored !== false && !g.passed).map((g) => g.name);
      index.push(
        `| [${c.name}](${name}) | ${side} | ${fixed} | ${failed.length ? failed.join(', ') : '—'} | $${r.costUsd.toFixed(2)} | ${
          r.durationSeconds
        } s | ${r.turns} |`
      );
      const cwd = r.tracePath && path.join(path.dirname(path.dirname(r.tracePath)), 'home/cwd');
      const body = [`# ${c.name}, ${side} the plugin, run ${i + 1}`, ''];
      body.push(
        `${fixed}${verdict?.waste !== undefined ? ` (waste ${verdict.waste})` : ''}; checks ${r.graders.filter((g) => g.passed).length} of ${
          r.graders.length
        }${failed.length ? `, failed: ${failed.join(', ')}` : ''}; $${r.costUsd.toFixed(2)}, ${r.durationSeconds} s, ${r.turns} turns${
          r.error ? `; error: ${r.error}` : ''
        }`,
        ''
      );
      if (!r.tracePath || !fs.existsSync(r.tracePath)) {
        body.push('No trace kept: run with `--keep-temp`.');
        fs.writeFileSync(path.join(out, name), body.join('\n') + '\n');
        return;
      }
      const { lines, result } = steps(r.tracePath, cwd);
      body.push('## The prompt', '', fence(c.promptMarkdown.replace(/^---[\s\S]*?---\s*/, '').trim()), '');
      body.push('## The answer', '', local(String(result?.result ?? '(none)'), cwd).replace(/^/gm, '> '), '');
      const changes = diff(path.join(repo, 'test/eval-plugin', c.dir), cwd);
      body.push('## What it changed', '', changes ? fence(changes.trim()) : 'Nothing.', '');
      body.push('## The steps', '', ...lines);
      fs.writeFileSync(path.join(out, name), body.join('\n'));
    });
  }
}
fs.writeFileSync(
  path.join(out, 'README.md'),
  [
    '# Transcripts',
    '',
    `${index.length} runs of ${run.cases.length} cases, ${run.startedAt.slice(0, 10)}, Claude Code ${run.claudeVersion}, ${
      Object.keys(run.cases[0]?.arms ?? {}).length > 1 ? 'with the plugin and without it' : 'with the plugin only'
    }: each file is one run's prompt, answer, the diff it left and its steps, long tool answers cut. Written by \`test/eval-plugin/transcripts.mjs\` from the run's sandboxes; the benchmark's numbers are in \`docs/benchmarks.md\`.`,
    '',
    '| Run | Plugin | Recording after | Failed checks | Cost | Time | Turns |',
    '| --- | --- | --- | --- | --: | --: | --: |',
    ...index,
    '',
  ].join('\n')
);
console.log(`${index.length} transcripts in ${path.relative(process.cwd(), out) || '.'}`);
if (args.includes('--publish')) publish(out);

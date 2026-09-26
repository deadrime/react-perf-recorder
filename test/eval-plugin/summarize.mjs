#!/usr/bin/env node
// A `claude plugin eval` run as the docs' benchmark page shows it: docs/benchmarks.json for the site's charts, and
// the tables between the results markers of docs/benchmarks.md for GitHub.
//   node test/eval-plugin/summarize.mjs .agent-artifacts/run7/aggregate-result.json
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import prettier from 'prettier';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const [input] = process.argv.slice(2);
if (!input) throw new Error('usage: summarize.mjs <aggregate-result.json>');
const run = JSON.parse(fs.readFileSync(input, 'utf8'));

// verify.mjs's verdicts, when the run kept its sandboxes: whether the waste is gone from a new recording of the result.
const verified = (() => {
  try {
    return JSON.parse(fs.readFileSync(path.join(path.dirname(input), 'verify.json'), 'utf8')).cases;
  } catch {
    return null;
  }
})();

const mean = (xs) => xs.reduce((s, x) => s + x, 0) / xs.length;
const round = (x, digits = 2) => Number(x.toFixed(digits));
const count = (xs, f) => xs.filter(f).length;
/** Runs as [result, verdict] pairs: the eval's result and verify.mjs's, which is null when nothing was kept. */
const arm = (pairs) => {
  const runs = pairs.map(([r]) => r);
  const proving = runs.filter((r) => r.graders.some((g) => g.name === 'measured'));
  // The code checks alone: `named` is about the answer and `measured` about the proof, not the fix.
  const checked = count(runs, (r) => r.graders.every((g) => g.name === 'named' || g.name === 'measured' || g.passed));
  return {
    runs: runs.length,
    // The case without a bug also wants the code untouched: a page that still works is not enough.
    solved: verified ? count(pairs, ([r, v]) => v?.fixed && r.graders.every((g) => g.name !== 'untouched' || g.passed)) : checked,
    checked,
    passed: count(runs, (r) => r.passed),
    score: round(mean(runs.map((r) => r.score))),
    cost: round(mean(runs.map((r) => r.costUsd)), 3),
    seconds: Math.round(mean(runs.map((r) => r.durationSeconds))),
    turns: Math.round(mean(runs.map((r) => r.turns))),
    measured: count(proving, (r) => r.graders.some((g) => g.name === 'measured' && g.passed)),
    proving: proving.length,
  };
};
const pairs = (c, side) => c.arms[side].map((r, i) => [r, verified?.[c.name]?.[side]?.[i] ?? null]);

const cases = run.cases.map((c) => ({
  name: c.name,
  input: c.name === 'no-bug-rec' ? 'control' : c.name.endsWith('-rec') ? 'recording' : 'complaint',
  with: arm(pairs(c, 'with')),
  without: arm(pairs(c, 'without')),
}));
const all = (side) => arm(run.cases.flatMap((c) => pairs(c, side)));
const summary = {
  date: run.startedAt.slice(0, 10),
  claudeVersion: run.claudeVersion,
  totalCost: round(run.costUsd),
  with: all('with'),
  without: all('without'),
  cases,
};
// Formatted as the repository formats markdown and JSON, so a new run changes only its numbers.
const write = async (file, text) => fs.writeFileSync(file, await prettier.format(text, { ...(await prettier.resolveConfig(file)), filepath: file }));
await write(path.join(repo, 'docs/benchmarks.json'), JSON.stringify(summary));

const usd = (x) => `$${x.toFixed(2)}`;
const times = (a, b) => `${(a / b).toFixed(1)}×`;
const { with: w, without: wo } = summary;
const table = [
  `${w.runs} runs a side over ${cases.length} cases, ${summary.date}, Claude Code ${summary.claudeVersion}; the whole run cost ${usd(
    summary.totalCost
  )}.`,
  '',
  '|                                   | With the recorder | Without | |',
  '| --------------------------------- | ----------------: | ------: | - |',
  `| Fixed: the waste gone from a new recording, the page working | ${w.solved} of ${w.runs} | ${wo.solved} of ${wo.runs} | ${
    verified ? '' : 'not verified: the code checks'
  } |`,
  `| The code checks passed | ${w.checked} of ${w.runs} | ${wo.checked} of ${wo.runs} | |`,
  `| Every check passed, the answer naming the file | ${w.passed} of ${w.runs} | ${wo.passed} of ${wo.runs} | |`,
  `| Proved with a before/after recording | ${w.measured} of ${w.proving} | — | no browser to measure with |`,
  `| Cost of a task, mean              | ${usd(w.cost)} | ${usd(wo.cost)} | ${times(wo.cost, w.cost)} cheaper |`,
  `| Time to the answer, mean          | ${w.seconds} s | ${wo.seconds} s | ${times(wo.seconds, w.seconds)} faster |`,
  `| Turns, mean                       | ${w.turns} | ${wo.turns} | |`,
  '',
  '| Case | What the agent gets | Fixed, with / without | Cost, with / without | Time, with / without |',
  '| ---- | ------------------- | --------------------- | -------------------- | -------------------- |',
  ...cases.map(
    (c) =>
      `| \`${c.name}\` | ${
        { recording: 'the steps and the person’s recording', complaint: 'a one-line complaint', control: 'the steps and a recording, no bug' }[
          c.input
        ]
      } | ` +
      `${c.with.solved}/${c.with.runs} · ${c.without.solved}/${c.without.runs} | ${usd(c.with.cost)} · ${usd(c.without.cost)} | ` +
      `${c.with.seconds} s · ${c.without.seconds} s |`
  ),
].join('\n');

const page = path.join(repo, 'docs/benchmarks.md');
const text = fs.readFileSync(page, 'utf8');
const marked = /(<!-- results:start -->)[\s\S]*?(<!-- results:end -->)/;
if (!marked.test(text)) throw new Error('docs/benchmarks.md has no results markers');
await write(
  page,
  text.replace(marked, (_, start, end) => `${start}\n\n${table}\n\n${end}`)
);

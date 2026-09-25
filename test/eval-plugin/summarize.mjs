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

const mean = (xs) => xs.reduce((s, x) => s + x, 0) / xs.length;
const round = (x, digits = 2) => Number(x.toFixed(digits));
const arm = (runs) => ({
  runs: runs.length,
  solved: runs.filter((r) => r.passed).length,
  score: round(mean(runs.map((r) => r.score))),
  cost: round(mean(runs.map((r) => r.costUsd)), 3),
  seconds: Math.round(mean(runs.map((r) => r.durationSeconds))),
  turns: Math.round(mean(runs.map((r) => r.turns))),
  measured: runs.filter((r) => r.graders.some((g) => g.name === 'measured' && g.passed)).length,
});

const cases = run.cases.map((c) => {
  const bug = c.name.replace(/-rec$/, '');
  return {
    name: c.name,
    bug,
    input: c.name.endsWith('-rec') ? 'recording' : 'complaint',
    with: arm(c.arms.with),
    without: arm(c.arms.without),
  };
});
const all = (side) => arm(run.cases.flatMap((c) => c.arms[side]));
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
  `| Fixed at the cause                | ${w.solved} of ${w.runs} | ${wo.solved} of ${wo.runs} | |`,
  `| Proved with a before/after recording | ${w.measured} of ${w.runs} | — | no browser to measure with |`,
  `| Cost of a task, mean              | ${usd(w.cost)} | ${usd(wo.cost)} | ${times(wo.cost, w.cost)} cheaper |`,
  `| Time to the answer, mean          | ${w.seconds} s | ${wo.seconds} s | ${times(wo.seconds, w.seconds)} faster |`,
  `| Turns, mean                       | ${w.turns} | ${wo.turns} | |`,
  '',
  '| Case | What the agent gets | Fixed, with / without | Cost, with / without | Time, with / without |',
  '| ---- | ------------------- | --------------------- | -------------------- | -------------------- |',
  ...cases.map(
    (c) =>
      `| \`${c.name}\` | ${c.input === 'recording' ? 'the steps and the person’s recording' : 'a one-line complaint'} | ` +
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

#!/usr/bin/env node
// Every case's workspace as a run gets it, checked live: the app renders, the person's recording is saved, and the
// component the bug is in is among the recording's first roots. Runs the scaffolds one by one and stops their servers.
//   npm run build && node test/eval-plugin/check.mjs [case…]
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../..');

// Where each case's wasted renders start; the case without a bug has none to find.
const ROOTS = {
  'whole-object-rec': 'Unread',
  'form-watch-rec': 'Composer',
  'field-state-rec': 'MetaInput',
  'memo-cache-slot-rec': 'Status',
  'new-array-selector-rec': 'MessageList',
  'router-in-layout-rec': 'ChatView',
  'exact-value-rec': 'TimeAgo',
  'effect-derived-state-rec': 'ChatPanel',
  'inline-context-rec': 'SettingsBySync',
  'nested-component-rec': 'MessageInput',
  'expensive-render-rec': 'ChannelStats',
  'draft-context-rec': 'Layout',
  'two-bugs-rec': 'Unread',
  'no-bug-rec': null,
};

const only = process.argv.slice(2);
const cases = fs
  .readdirSync(path.join(here, 'evals'))
  .filter((c) => c.endsWith('-rec') && (!only.length || only.includes(c)))
  .map((c) => {
    const script = fs.readFileSync(path.join(here, 'evals', c, 'scaffold.sh'), 'utf8');
    return { name: c, bug: /scaffold\.mjs" ([\w,-]+)/.exec(script)[1], scenario: /--recorded=(\w+)/.exec(script)?.[1] };
  });

const sessions = fs.mkdtempSync(path.join(os.tmpdir(), 'rpr-check-'));
const runFile = path.join(repo, '.agent-artifacts/eval-run.json');
fs.mkdirSync(path.dirname(runFile), { recursive: true });
fs.writeFileSync(runFile, JSON.stringify({ sessions, browsers: process.env.PLAYWRIGHT_BROWSERS_PATH }));
const stop = () => {
  for (const pid of fs.existsSync(path.join(sessions, 'servers')) ? fs.readdirSync(path.join(sessions, 'servers')) : []) {
    try {
      process.kill(Number(pid));
    } catch {}
  }
};
process.on('exit', stop);

let failed = 0;
for (const c of cases) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `rpr-check-${c.bug}-`));
  try {
    execFileSync(process.execPath, [path.join(here, 'evals/scaffold.mjs'), c.bug, dir, `--recorded=${c.scenario}`], { stdio: 'inherit' });
    const id = fs.readFileSync(path.join(dir, 'recording.txt'), 'utf8').trim();
    const show = JSON.parse(execFileSync(process.execPath, [path.join(repo, 'dist/cli.js'), 'show', id, '--dir', sessions], { encoding: 'utf8' }));
    const roots = show.topRoots.slice(0, 3).map((r) => r.root);
    const ok = ROOTS[c.name] === null || roots.includes(ROOTS[c.name]);
    if (!ok) failed++;
    const top = show.topRoots.slice(0, 3).map((r) => `${r.root} ×${r.hits}${r.renderMsPerHit >= 5 ? ` ${r.renderMsPerHit} ms` : ''}`);
    console.log(
      `${ok ? '✓' : '✗'} ${c.name.padEnd(24)} ${c.scenario.padEnd(5)} ${show.totals.renders} renders, ${
        show.totals.rendersWithoutDom
      } without DOM | ${top.join(', ')}`
    );
  } catch (error) {
    failed++;
    console.log(`✗ ${c.name}: ${String(error.message).split('\n')[0]}`);
  } finally {
    stop();
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
fs.rmSync(sessions, { recursive: true, force: true });
process.exit(failed ? 1 : 0);

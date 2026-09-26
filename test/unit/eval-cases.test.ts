// @vitest-environment node
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// The agent benchmark's cases: every bug's patch applies to the chat app, and a case's file check tells the patched
// app from the clean one — a check that passes on the bug, or fails on the clean app, would score nothing.
const root = path.resolve(__dirname, '../eval-plugin');
const app = path.join(root, 'app');
const bugs = fs.readdirSync(path.join(root, 'bugs')).map((f) => f.replace(/\.patch$/, ''));

interface Grader {
  path?: string;
  pattern: string;
  absent: boolean;
}

/** The frontmatter of a file grader: its path, its pattern as the YAML single-quoted string holds it, and `match`. */
function fileGrader(file: string): Grader | null {
  const text = fs.readFileSync(file, 'utf8');
  const target = /^target: \{ source: file, path: (\S+) \}$/m.exec(text)?.[1];
  const pattern = /^pattern: '(.*)'$/m.exec(text)?.[1].replace(/''/g, "'");
  if (!target || pattern === undefined) return null;
  return { path: target, pattern, absent: /^match: not_contains$/m.test(text) };
}

function patched(bug: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `rpr-case-${bug}-`));
  fs.cpSync(app, dir, { recursive: true });
  execFileSync('patch', ['-p1', '--forward', '--batch', '--quiet', '-d', dir, '-i', path.join(root, 'bugs', `${bug}.patch`)]);
  return dir;
}

const passes = (dir: string, g: Grader) => {
  const file = path.join(dir, g.path!);
  const found = fs.existsSync(file) && new RegExp(g.pattern).test(fs.readFileSync(file, 'utf8'));
  return g.absent ? !found : found;
};

describe('eval cases', () => {
  it('has a patch for every case and a case for every patch', () => {
    const cases = fs.readdirSync(path.join(root, 'evals')).filter((d) => fs.existsSync(path.join(root, 'evals', d, 'scaffold.sh')));
    const used = new Set(cases.map((c) => /scaffold\.mjs" ([\w-]+)/.exec(fs.readFileSync(path.join(root, 'evals', c, 'scaffold.sh'), 'utf8'))![1]));
    expect([...used].sort()).toEqual([...bugs].sort());
  });

  describe.each(bugs)('%s', (bug) => {
    let dir: string;
    beforeAll(() => {
      dir = patched(bug);
    });
    afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

    const cases = fs.readdirSync(path.join(root, 'evals')).filter((c) => c.replace(/-rec$/, '') === bug);
    const graders: Array<[string, Grader]> = [];
    for (const c of cases)
      for (const name of ['fixed.md', 'old-read-gone.md']) {
        const file = path.join(root, 'evals', c, 'graders', name);
        const grader = fs.existsSync(file) ? fileGrader(file) : null;
        if (grader) graders.push([`${c}/${name}`, grader]);
      }

    it('its file checks fail on the bug and pass on the clean app', () => {
      for (const [name, g] of graders) {
        expect({ name, onBug: passes(dir, g) }).toEqual({ name, onBug: false });
        expect({ name, onClean: passes(app, g) }).toEqual({ name, onClean: true });
      }
    });
  });
});

// @vitest-environment node
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

// Orbit's agent cases, written by test/eval-large/evals.mjs: each is what the generator writes today, its scaffold
// applies patches that exist, its edit check lets a fix touch the bug's files and nothing else, and its answer check
// wants every bug of the case named.
const large = path.resolve(__dirname, '../eval-large');
const evals = path.resolve(__dirname, '../eval-plugin/evals-large');

const pattern = (file: string) => {
  const text = fs.readFileSync(file, 'utf8');
  return new RegExp(/^pattern: '(.*)'$/m.exec(text)![1].replace(/''/g, "'"));
};
const edit = (file: string) =>
  JSON.stringify({ name: 'Edit', input: { file_path: `/tmp/w/home/cwd/src/${file}`, old_string: 'a', new_string: 'b' } });

describe('Orbit eval cases', () => {
  let BUGS: Record<string, { patches?: string[]; files: string[]; named: string[] }>;
  beforeAll(async () => {
    ({ BUGS } = await import(path.join(large, 'cases.mjs')));
  });

  it('are what evals.mjs writes', () => {
    const written = (dir: string) =>
      fs
        .readdirSync(dir, { recursive: true, withFileTypes: true })
        .filter((e) => e.isFile())
        .map((e) => {
          const file = path.join(e.parentPath, e.name);
          return [path.relative(dir, file), fs.readFileSync(file, 'utf8')];
        })
        .sort();
    const before = written(evals);
    execFileSync(process.execPath, [path.join(large, 'evals.mjs')], { stdio: 'ignore' });
    expect(written(evals)).toEqual(before);
  });

  it('apply patches that exist', () => {
    const cases = fs.readdirSync(evals);
    expect(cases.length).toBeGreaterThan(0);
    for (const name of cases) {
      const script = fs.readFileSync(path.join(evals, name, 'scaffold.sh'), 'utf8');
      expect(script).toContain('--app=large');
      const bugs = /scaffold\.mjs" ([\w,-]+)/.exec(script)![1].split(',');
      for (const bug of bugs) expect(fs.existsSync(path.join(large, 'bugs', `${bug}.patch`))).toBe(true);
    }
  });

  it("let a fix edit the bug's files and nothing else", () => {
    for (const [bug, c] of Object.entries(BUGS)) {
      const patches = c.patches ?? [bug];
      if (!patches.length) continue;
      const focused = pattern(path.join(evals, `orbit-${bug}-rec`, 'graders/focused.md'));
      for (const file of patches.flatMap((p) => BUGS[p].files))
        expect({ bug, file, flagged: focused.test(edit(file)) }).toEqual({ bug, file, flagged: false });
      expect(focused.test(edit('main.tsx'))).toBe(true);
      expect(focused.test(edit(`${patches.flatMap((p) => BUGS[p].files)[0]}.bak`))).toBe(true);
    }
  });

  it('want every bug of a case named in the answer', () => {
    const named = pattern(path.join(evals, 'orbit-three-bugs-rec/graders/named.md'));
    expect(named.test('AuthContext.tsx depends on the connection; members.ts builds a Map; IssuesPage.tsx copies state.')).toBe(true);
    expect(named.test('IssuesPage.tsx copies state, and members.ts builds a Map.')).toBe(false);
    const one = pattern(path.join(evals, 'orbit-row-callback-rec/graders/named.md'));
    expect(one.test('The arrow in IssueRow.tsx')).toBe(true);
    expect(one.test('The arrow in the table')).toBe(false);
  });
});

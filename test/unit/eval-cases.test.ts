// @vitest-environment node
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// The agent benchmark's cases: every bug's patch applies to the chat app, a case's file checks tell the patched app
// from the clean one, and its trace checks tell an edit of the bug's file from an edit of any other — a check that
// passes on the bug, or fails on the right fix, would score nothing.
const root = path.resolve(__dirname, '../eval-plugin');
const app = path.join(root, 'app');
const evals = path.join(root, 'evals');
const patches = fs.readdirSync(path.join(root, 'bugs')).map((f) => f.replace(/\.patch$/, ''));

interface Grader {
  name: string;
  file?: string;
  pattern: RegExp;
  absent: boolean;
}

/** A regex grader's frontmatter: its target, its pattern as the YAML single-quoted string holds it, and `match`. */
function grader(file: string): Grader | null {
  const text = fs.readFileSync(file, 'utf8');
  const pattern = /^pattern: '(.*)'$/m.exec(text)?.[1].replace(/''/g, "'");
  if (pattern === undefined) return null;
  return {
    name: path.basename(file, '.md'),
    file: /^target: \{ source: file, path: (\S+) \}$/m.exec(text)?.[1],
    pattern: new RegExp(pattern),
    absent: /^match: not_contains$/m.test(text),
  };
}

const cases = fs
  .readdirSync(evals)
  .filter((c) => fs.existsSync(path.join(evals, c, 'scaffold.sh')))
  .map((name) => {
    const bugs = /scaffold\.mjs" ([\w,-]+)/.exec(fs.readFileSync(path.join(evals, name, 'scaffold.sh'), 'utf8'))![1];
    const graders = fs
      .readdirSync(path.join(evals, name, 'graders'))
      .map((g) => grader(path.join(evals, name, 'graders', g)))
      .filter((g): g is Grader => g !== null);
    return { name, bugs: bugs === 'none' ? [] : bugs.split(','), graders };
  });

function patched(bugs: string[]): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rpr-case-'));
  fs.cpSync(app, dir, { recursive: true });
  for (const bug of bugs) execFileSync('patch', ['-p1', '--forward', '--batch', '--quiet', '-d', dir, '-i', path.join(root, 'bugs', `${bug}.patch`)]);
  return dir;
}

const passes = (dir: string, g: Grader) => {
  const file = path.join(dir, g.file!);
  const found = fs.existsSync(file) && g.pattern.test(fs.readFileSync(file, 'utf8'));
  return g.absent ? !found : found;
};

/** A trace line with one edit of a file under the workspace's src, in both spellings Claude Code has used. */
const edits = (file: string) => [
  JSON.stringify({ name: 'Edit', input: { file_path: `/tmp/w/home/cwd/src/${file}`, old_string: 'a', new_string: 'b' } }),
  JSON.stringify({ name: 'Edit', input: { file_path: `/tmp/w/home/cwd/src/${file}`, old_text: 'a', new_text: 'b' } }),
  JSON.stringify({ name: 'Write', input: { file_path: `/tmp/w/home/cwd/src/${file}`, contents: 'b' } }),
];

describe('eval cases', () => {
  it('uses every patch, and every patch a case names exists', () => {
    const used = new Set(cases.flatMap((c) => c.bugs));
    expect([...used].sort()).toEqual([...patches].sort());
  });

  describe.each(cases)('$name', ({ bugs, graders }) => {
    let dir: string;
    beforeAll(() => {
      dir = patched(bugs);
    });
    afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

    it('its file checks fail on the bug and pass on the clean app', () => {
      for (const g of graders.filter((g) => g.file && g.name !== 'no-probes')) {
        expect({ grader: g.name, onBug: passes(dir, g) }).toEqual({ grader: g.name, onBug: false });
        expect({ grader: g.name, onClean: passes(app, g) }).toEqual({ grader: g.name, onClean: true });
      }
    });

    it("its edit check lets the bug's own files be edited and nothing else", () => {
      const focus = graders.find((g) => g.name === 'focused' || g.name === 'untouched')!;
      expect(focus.absent).toBe(true);
      for (const line of edits('components/WebhookForm.tsx')) expect(focus.pattern.test(line)).toBe(true);
      for (const g of graders.filter((g) => g.file && g.name !== 'no-probes'))
        for (const line of edits(g.file!.replace(/^src\//, '')))
          expect({ file: g.file, flagged: focus.pattern.test(line) }).toEqual({ file: g.file, flagged: false });
      // Reading a file is no edit.
      expect(focus.pattern.test(JSON.stringify({ name: 'Read', input: { file_path: '/tmp/w/home/cwd/src/components/WebhookForm.tsx' } }))).toBe(
        false
      );
    });
  });

  it('memo-cache-slot counts a fix in either file, and nothing else', () => {
    const fixed = cases.find((c) => c.name === 'memo-cache-slot-rec')!.graders.find((g) => g.name === 'fixed')!;
    const edit = (file: string, text: string, keys: [string, string]) =>
      JSON.stringify({ name: 'Edit', input: { file_path: `/w/src/${file}`, [keys[0]]: 'x', [keys[1]]: text } });
    for (const keys of [
      ['old_string', 'new_string'],
      ['old_text', 'new_text'],
    ] as Array<[string, string]>) {
      expect(fixed.pattern.test(edit('store/selectors.ts', 'memoizeWithArgs(messageInfo, { size: 50 })', keys))).toBe(true);
      expect(fixed.pattern.test(edit('components/Messages.tsx', 'useMemo(() => memoize((s) => messageInfo(s, id)), [id])', keys))).toBe(true);
      expect(fixed.pattern.test(edit('components/Header.tsx', 'memoize((s) => 1)', keys))).toBe(false);
    }
    expect(fixed.pattern.test(JSON.stringify({ type: 'tool_result', content: 'memoizeWithArgs(messageInfo, { size: 1 })' }))).toBe(false);
  });
});

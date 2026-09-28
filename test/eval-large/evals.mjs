#!/usr/bin/env node
// Writes the large app's agent cases from cases.mjs and scenarios.mjs: test/eval-plugin/evals-large/orbit-<bug>-rec,
// each with the person's complaint and steps, a scaffold that records them, and graders. Rerun after changing either.
// No case for no-bug: the clean app does render for nothing (see the README), so "change nothing" is not the answer.
//   node test/eval-large/evals.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import prettier from 'prettier';
import { BUGS } from './cases.mjs';
import { SCENARIOS } from './scenarios.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(here, '../eval-plugin/evals-large');
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const EDIT = '","(?:old_string|old_text|new_string|new_text|content|contents)"';

/** A grader file: YAML front matter only. */
const grader = (fields) =>
  `---\n${Object.entries(fields)
    .map(([k, v]) => `${k}: ${v}`)
    .join('\n')}\n---\n`;
const quote = (s) => `'${s.replace(/'/g, "''")}'`;

fs.rmSync(out, { recursive: true, force: true });
const cases = Object.entries(BUGS).filter(([bug, c]) => (c.patches ?? [bug]).length);
for (const [bug, c] of cases) {
  const name = `orbit-${bug}-rec`;
  const dir = path.join(out, name);
  const patches = c.patches ?? [bug];
  fs.mkdirSync(path.join(dir, 'graders'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'case.yaml'), `schema_version: '1.1'\nname: ${name}\ntags: [large]\ncontext:\n  scaffold_script: scaffold.sh\n`);
  fs.writeFileSync(
    path.join(dir, 'scaffold.sh'),
    `#!/usr/bin/env bash\nexec node "$(dirname "\${BASH_SOURCE[0]}")/../../evals/scaffold.mjs" ${patches.join(',')} . --app=large --recorded=${
      c.scenario
    }\n`,
    { mode: 0o755 }
  );
  fs.writeFileSync(
    path.join(dir, 'prompt.md'),
    await prettier.format(
      `---
max_turns: 80
timeout_seconds: 1500
allowed_tools: [Read, Grep, Glob, Skill, Agent]
---

A React app is in this folder, its source in ./src. Its dev server is already running at the url in ./dev-url.txt and
reloads as the source changes.
The complaint: ${c.complaint[0].toLowerCase()}${c.complaint.slice(1)}
To reproduce: ${SCENARIOS[c.scenario].steps}
I recorded it with the recorder's panel in the page; the recording's id is in ./recording.txt.
Find out whether anything on the page re-renders for nothing, and why. Fix what does in ./src without changing what
the page shows, and show with before-and-after numbers that the fix worked. If nothing does, say so and change
nothing.
`,
      { parser: 'markdown', proseWrap: 'preserve' }
    )
  );
  const graders = {};
  const parts = patches.map((p) => BUGS[p]);
  const files = [...new Set(parts.flatMap((p) => p.files))];
  // Each bug named by one of its files, in any order.
  const named = parts.map((p) => `(?=[\\s\\S]*(?:${p.named.map(escape).join('|')}))`).join('');
  graders.named = grader({ type: 'regex', target: 'last_message', pattern: quote(`^${named}`) });
  graders.focused = grader({
    type: 'regex',
    target: 'trace',
    pattern: quote(`"file_path":"(?![^"]*/src/(?:${files.map(escape).join('|')})")[^"]*/src/[^"]*${EDIT}`),
    match: 'not_contains',
  });
  graders.measured = grader({ type: 'regex', target: 'trace', pattern: quote('compare_recordings'), arm: 'with-only' });
  for (const [i, p] of parts.entries())
    graders[parts.length > 1 ? `no-probes-${patches[i]}` : 'no-probes'] = grader({
      type: 'regex',
      target: `{ source: file, path: src/${p.files[0]} }`,
      pattern: quote('console\\.(count|log|time)'),
      match: 'not_contains',
    });
  for (const [file, text] of Object.entries(graders)) fs.writeFileSync(path.join(dir, 'graders', `${file}.md`), text);
}
console.log(`${cases.length} cases in ${path.relative(process.cwd(), out)}`);

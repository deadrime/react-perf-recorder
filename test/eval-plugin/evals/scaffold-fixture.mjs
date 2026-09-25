#!/usr/bin/env node
// The fixture's source for one case's workspace, as a real app with that bug would read: each bug('…') switch
// becomes the branch the page runs, and code only the other branch used is blanked out, its switch's comment too.
// Blanked code keeps its lines, so the file:line a recording gives is the same line here.
//   node scaffold-fixture.mjs <bug id> <target dir>
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const ts = createRequire(path.join(repo, 'package.json'))('typescript');
const [active, target = '.'] = process.argv.slice(2);
if (!active) throw new Error('usage: scaffold-fixture.mjs <bug id> [target dir]');

const from = path.join(repo, 'test/e2e/fixture-app/src');
// The bug list, the demo pages and the docs name the bugs and show both versions.
const LEFT_OUT = new Set(['bugs.ts', 'Demo.tsx', 'Docs.tsx', 'basics', 'advanced', 'app.css']);
// A comment that talks about the switch or the other version is a hint no real app would carry.
const TELLING = /\b(bugs?|flags?|clean|broken|fix(ed)?|seeded)\b/i;
const quiet = (code) => code.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, (c) => (TELLING.test(c) ? blank(c) : c));

/** Spaces over code, newlines kept: the text is gone and every line stays where it was. */
const blank = (text) => text.replace(/[^\n]/g, ' ');

function rewrite(code, file) {
  const source = ts.createSourceFile(file, code, ts.ScriptTarget.Latest, true, file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const edits = [];
  const isSwitch = (node) =>
    ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'bug' && ts.isStringLiteral(node.arguments[0] ?? {});
  const statementOf = (node) => {
    while (node.parent && !ts.isSourceFile(node.parent) && !ts.isBlock(node.parent)) node = node.parent;
    return node;
  };
  const commentAbove = (node) => {
    const statement = statementOf(node);
    const start = statement.getFullStart();
    return { start, end: statement.getStart(source) };
  };
  (function visit(node) {
    if (ts.isImportDeclaration(node) && /\/bugs['"]$/.test(node.moduleSpecifier.getText(source))) {
      edits.push({ start: node.getStart(source), end: node.getEnd(), text: '' });
      return;
    }
    if (ts.isConditionalExpression(node) && isSwitch(node.condition)) {
      const on = node.condition.arguments[0].text === active;
      const kept = (on ? node.whenTrue : node.whenFalse).getText(source);
      edits.push(commentAbove(node));
      edits.push({ start: node.getStart(source), end: node.getEnd(), text: kept });
      return;
    }
    if (isSwitch(node)) {
      edits.push(commentAbove(node));
      edits.push({ start: node.getStart(source), end: node.getEnd(), text: String(node.arguments[0].text === active) });
      return;
    }
    ts.forEachChild(node, visit);
  })(source);
  return apply(code, edits);
}

/** Replaced text keeps the lines it covered; a comment range is only blanked. */
function apply(code, edits) {
  edits.sort((a, b) => b.start - a.start);
  for (const { start, end, text } of edits) {
    const old = code.slice(start, end);
    const lines = (old.match(/\n/g) ?? []).length;
    const replacement = text === undefined ? blank(old) : text + '\n'.repeat(Math.max(0, lines - (text.match(/\n/g) ?? []).length));
    code = code.slice(0, start) + replacement + code.slice(end);
  }
  return code;
}

/** Top-level declarations nothing uses any more — the other branch's hooks and components — blanked, until none is left. */
function dropUnused(code, file) {
  for (;;) {
    const source = ts.createSourceFile(file, code, ts.ScriptTarget.Latest, true, file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    const uses = new Map();
    (function count(node) {
      if (ts.isIdentifier(node)) uses.set(node.text, (uses.get(node.text) ?? 0) + 1);
      ts.forEachChild(node, count);
    })(source);
    const exported = (s) => s.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
    const unused = source.statements.filter((s) => {
      if (exported(s)) return false;
      if (ts.isFunctionDeclaration(s) && s.name) return uses.get(s.name.text) === 1;
      if (ts.isVariableStatement(s)) return s.declarationList.declarations.every((d) => ts.isIdentifier(d.name) && uses.get(d.name.text) === 1);
      return false;
    });
    if (!unused.length) return code;
    code = apply(
      code,
      unused.map((s) => ({ start: s.getFullStart(), end: s.getEnd() }))
    );
  }
}

function copy(dir, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (LEFT_OUT.has(entry.name)) continue;
    const src = path.join(dir, entry.name);
    const dst = path.join(to, entry.name);
    if (entry.isDirectory()) copy(src, dst);
    else if (/\.tsx?$/.test(entry.name)) {
      const code = fs.readFileSync(src, 'utf8');
      fs.writeFileSync(dst, quiet(code.includes('bugs') ? dropUnused(rewrite(code, src), src) : code));
    } else fs.copyFileSync(src, dst);
  }
}

copy(from, path.join(target, 'src'));

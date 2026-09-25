#!/usr/bin/env node
// The fixture's source for one case's workspace, as a real app with that bug would read: each bug('…') switch
// becomes the branch the page runs, and code only the other branch used is blanked out, its switch's comment too.
// Blanked code keeps its lines. The copy is an app of its own: a dev server of the run serves it, so the agent's
// fix reloads in the page it records, and its url is left in dev-url.txt.
//   node scaffold-fixture.mjs <bug id> [target dir] [--no-serve]
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const ts = createRequire(path.join(repo, 'package.json'))('typescript');
const [active, target = '.'] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
if (!active) throw new Error('usage: scaffold-fixture.mjs <bug id> [target dir]');

const from = path.join(repo, 'test/e2e/fixture-app/src');
// The bug list, the demo pages and the docs name the bugs and show both versions.
const LEFT_OUT = new Set(['bugs.ts', 'Demo.tsx', 'Docs.tsx', 'basics', 'advanced', 'main.tsx']);
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
    if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(source) === 'BugStrip') {
      edits.push({ start: node.getStart(source), end: node.getEnd(), text: '' });
      return;
    }
    if (ts.isImportDeclaration(node) && /\/(bugs|Demo)['"]$/.test(node.moduleSpecifier.getText(source))) {
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
      fs.writeFileSync(dst, quiet(/bugs|Demo/.test(code) ? dropUnused(rewrite(code, src), src) : code));
    } else if (entry.name.endsWith('.css')) fs.writeFileSync(dst, quiet(fs.readFileSync(src, 'utf8')));
    else fs.copyFileSync(src, dst);
  }
}

const MAIN = `import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import './app.css';
import { app } from './app-router';
import { Layout } from './components/ChatView';

const client = new QueryClient();
const router = createBrowserRouter([{ path: '*', element: <Layout /> }]);
app.router = router;

createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={client}>
    <RouterProvider router={router} />
  </QueryClientProvider>
);
`;

const freePort = () =>
  new Promise((resolve) => {
    const server = net.createServer().listen(0, () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });

/** A dev server of this workspace, left running for the run; run.sh stops every one it finds in servers/. */
async function serve(dir) {
  const sessions = process.env.EVAL_RPR_DIR ?? fs.mkdtempSync(path.join(fs.realpathSync('/tmp'), 'rpr-eval-'));
  const port = await freePort();
  const log = fs.openSync(path.join(sessions, `dev-${port}.log`), 'a');
  const child = spawn(
    process.execPath,
    [path.join(repo, 'node_modules/vite/bin/vite.js'), '--config', path.join(repo, 'test/eval-plugin/workspace.vite.config.ts')],
    {
      cwd: repo,
      // NODE_ENV=production from the eval's environment would serve React's production JSX runtime: no jsxDEV, no app.
      env: { ...process.env, NODE_ENV: 'development', RPR_WORKSPACE: dir, RPR_PORT: String(port), RPR_SESSIONS: sessions },
      detached: true,
      stdio: ['ignore', log, log],
    }
  );
  child.unref();
  fs.mkdirSync(path.join(sessions, 'servers'), { recursive: true });
  fs.writeFileSync(path.join(sessions, 'servers', String(child.pid)), dir);
  const url = `http://localhost:${port}/`;
  for (let i = 0; i < 120; i++) {
    if (
      await fetch(url).then(
        (r) => r.ok,
        () => false
      )
    )
      break;
    await new Promise((r) => setTimeout(r, 500));
  }
  await warm(url);
  fs.writeFileSync(path.join(dir, 'dev-url.txt'), `${url}?tick=150\n`);
}

/**
 * The page opened once before the agent does: Vite pre-bundles what a first visit finds and reloads the page, which
 * would otherwise land in the agent's first recording and end it ("dev root not found").
 */
async function warm(url) {
  // A scaffold runs with HOME moved, like the agent: the browsers' folder comes from run.sh.
  const browsers = process.env.EVAL_PLAYWRIGHT_BROWSERS_PATH || process.env.PLAYWRIGHT_BROWSERS_PATH;
  const build =
    browsers && fs.existsSync(browsers)
      ? fs
          .readdirSync(browsers)
          .filter((d) => /^chromium-\d+$/.test(d))
          .sort()
          .pop()
      : undefined;
  const executablePath = build && path.join(browsers, build, 'chrome-linux/chrome');
  const { chromium } = createRequire(path.join(repo, 'package.json'))('playwright');
  const browser = await chromium
    .launch({ headless: true, ...(executablePath && fs.existsSync(executablePath) ? { executablePath } : {}) })
    .catch((error) => console.error(`no warm-up, the first recording may meet a reload: ${String(error.message).split('\n')[0]}`));
  if (!browser) return;
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    for (let i = 0; i < 2; i++) {
      await page.goto(url, { waitUntil: 'networkidle' });
      await page.waitForTimeout(1500);
    }
    const rendered = await page.evaluate(() => (document.getElementById('root')?.childElementCount ?? 0) > 0);
    if (!rendered) console.error(`the app did not render at ${url}: ${errors.slice(0, 3).join('; ') || 'no page error'}`);
  } finally {
    await browser.close();
  }
}

const dir = path.resolve(target);
copy(from, path.join(dir, 'src'));
fs.writeFileSync(path.join(dir, 'src/main.tsx'), MAIN);
fs.copyFileSync(path.join(repo, 'test/e2e/fixture-app/index.html'), path.join(dir, 'index.html'));
if (!fs.existsSync(path.join(dir, 'node_modules'))) fs.symlinkSync(path.join(repo, 'node_modules'), path.join(dir, 'node_modules'), 'dir');
if (!process.argv.includes('--no-serve')) await serve(dir);

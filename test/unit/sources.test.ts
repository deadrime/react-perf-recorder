import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { TraceMap } from '@jridgewell/trace-mapping';
import { relativeFile } from '../../src/core/fiber';
import { libraryOf, originOf, servedPath } from '../../src/core/stack';
import { healthUrls } from '../../src/mcp/record';
import { SCRIPTS_KEY } from '../../src/shared/inject';
import { ScriptCatalog, lineByText, sourcePath } from '../../src/sources/scripts';

describe('source maps without a dev server plugin', () => {
  it('reads each bundler’s way of naming a source as a path from the root', () => {
    expect(sourcePath('http://localhost:5173/src/components/Row.tsx?t=12')).toEqual({ rel: 'src/components/Row.tsx' });
    expect(sourcePath('webpack://my-app/./src/Row.tsx')).toEqual({ rel: 'src/Row.tsx' });
    expect(sourcePath('webpack-internal:///(app-pages-browser)/./shared/Row.tsx')).toEqual({ rel: 'shared/Row.tsx' });
    expect(sourcePath('webpack-internal:///(rsc)/./app/server/page.tsx')).toEqual({ rel: 'app/server/page.tsx' });
    expect(sourcePath('turbopack:///[project]/shared/Row.tsx')).toEqual({ rel: 'shared/Row.tsx' });
    expect(sourcePath('file:///home/me/app/src/Row.tsx')).toEqual({ abs: '/home/me/app/src/Row.tsx' });
    expect(sourcePath('http://localhost:5173/@fs/home/me/lib/Row.tsx')).toEqual({ abs: '/home/me/lib/Row.tsx' });
  });

  it('maps a position through the map the page loaded, to the file on disk under the root', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rpr-sources-'));
    // The app sits in a folder of its own under where the recorder runs, as a monorepo's does.
    const file = path.join(root, 'web', 'src', 'Row.tsx');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, "import { useState } from 'react';\nexport function Row() {\n  const [n] = useState(0);\n  return n;\n}\n");
    // Generated line 1 column 0 is the source's line 3 column 2.
    const map = { version: 3, sources: ['Row.tsx'], names: [], mappings: 'AAEE' };
    const catalog = new ScriptCatalog({ root, fetchText: async () => null });
    catalog.noteScript('http://localhost:3000/src/Row.tsx', `data:application/json;base64,${Buffer.from(JSON.stringify(map)).toString('base64')}`);
    expect(await catalog.mapSite('http://localhost:3000/src/Row.tsx', 1, 1)).toEqual({
      site: 'src/Row.tsx:3',
      code: 'const [n] = useState(0);',
    });
  });

  it('takes the line from the map when the file is not on this disk', async () => {
    const map = {
      version: 3 as const,
      sources: ['turbopack:///[project]/app/Row.tsx'],
      sourcesContent: ['a\nb\n  const x = useX();\n'],
      names: [],
      mappings: 'AAEE',
    };
    const catalog = new ScriptCatalog({ root: os.tmpdir(), fetchText: async (url) => (url.endsWith('.map') ? JSON.stringify(map) : null) });
    catalog.noteScript('http://localhost:3000/_next/static/chunks/app.js', 'app.js.map');
    expect(await catalog.mapSite('http://localhost:3000/_next/static/chunks/app.js', 1, 1)).toEqual({
      site: 'app/Row.tsx:3',
      code: 'const x = useX();',
    });
  });

  it('asks for the plugin at every folder the app could be served under', () => {
    expect(healthUrls('http://localhost:5173/repo/app?x=1')).toEqual([
      'http://localhost:5173/repo/app/__react-perf-recorder/health',
      'http://localhost:5173/repo/__react-perf-recorder/health',
      'http://localhost:5173/__react-perf-recorder/health',
    ]);
  });

  it('reads an absolute source a map wrote, which the browser resolved against the server', () => {
    const file = fs.mkdtempSync(path.join(os.tmpdir(), 'rpr-abs-'));
    expect(sourcePath(`http://localhost:3000${file}`)).toEqual({ abs: file });
  });

  it('tells whose code each line of a chunk is, the bundler’s own left out', () => {
    // Line 1 the runtime, 2 a package, 3 blank, 4 the app.
    const map = {
      version: 3 as const,
      sources: ['webpack://app/webpack/runtime/jsonp_chunk_loading', 'webpack://app/./node_modules/react/index.js', 'webpack://app/./src/App.tsx'],
      names: [],
      mappings: 'AAAA;ACAA;;ACAA',
    };
    const catalog = new ScriptCatalog({ root: os.tmpdir(), fetchText: async () => null });
    expect(catalog.tableOf({ raw: map, trace: new TraceMap(map) })).toEqual({
      s: ['node_modules/react/index.js', 'src/App.tsx'],
      l: [1, -1, 2, 0, 4, 1],
    });
    const single = { version: 3 as const, sources: ['App.tsx'], names: [], mappings: 'AAAA;AACA' };
    expect(catalog.tableOf({ raw: single, trace: new TraceMap(single, 'http://localhost:5173/src/App.tsx') })).toEqual({ s: ['src/App.tsx'], l: [] });
  });

  it('finds the line of a call in code a loader transformed, without a map', () => {
    const original = [
      "import { useState } from 'react';",
      'export function Counter() {',
      '  const [a] = useState(0);',
      '  const [b] = useState(1);',
      '  return <Row n={a + b} />;',
      '}',
      '',
    ].join('\n');
    const generated = [
      'function Counter() {',
      '  var a = (0,react__WEBPACK_IMPORTED_MODULE_0__.useState)(0)[0];',
      '  var b = (0,react__WEBPACK_IMPORTED_MODULE_0__.useState)(1)[0];',
      '  return (0,jsx_dev_runtime.jsxDEV)(_Row__WEBPACK_IMPORTED_MODULE_1__.Row, { n: a + b }, void 0, false);',
      '}',
    ].join('\n');
    // V8 points at the arguments of `(0, x.useState)(…)`.
    expect(lineByText(generated, 3, generated.split('\n')[2].indexOf(')(1)') + 2, original)).toBe(4);
    expect(lineByText(generated, 4, generated.split('\n')[3].indexOf(')(_Row') + 2, original)).toBe(5);
    // Babel 7 and swc write the element's line into the call.
    const swc = 'x = (0,jsx_dev_runtime.jsxDEV)("li", {}, void 0, false, { fileName: "a.tsx", lineNumber: 42, columnNumber: 3 }, this);';
    expect(lineByText(swc, 1, swc.indexOf(')("li"') + 2, original)).toBe(42);
  });
});

describe('a chunk’s sources in the page', () => {
  const chunk = 'http://localhost:3000/static/js/index.js';
  beforeEach(() => {
    (globalThis as Record<string, unknown>)[SCRIPTS_KEY] = {
      [chunk]: { s: ['node_modules/react-dom/cjs/react-dom.development.js', 'src/Row.tsx'], l: [1, -1, 10, 0, 20, 1] },
      'http://localhost:3000/src/App.tsx': { s: ['src/App.tsx'], l: [] },
    };
  });
  afterEach(() => {
    delete (globalThis as Record<string, unknown>)[SCRIPTS_KEY];
  });

  it('names the package or the app file by the line, not the chunk', () => {
    expect(libraryOf(chunk, 5)).toBe('');
    expect(libraryOf(`${chunk}?v=1`, 12)).toBe('react-dom');
    expect(libraryOf(chunk, 25)).toBeNull();
    expect(servedPath(chunk, 25)).toBe('src/Row.tsx');
    expect(relativeFile(chunk, '', 25)).toBe('src/Row.tsx');
    expect(relativeFile('http://localhost:3000/src/App.tsx?t=1', '', 7)).toBe('src/App.tsx');
    const error = new Error('x');
    // The first frame is where the recorder made the error.
    error.stack = `Error: x\n    at origin (${chunk}:2:1)\n    at eval (${chunk}:21:3)\n    at dispatch (${chunk}:11:1)`;
    expect(originOf(error).text).toBe('@ src/Row.tsx');
  });

  it('leaves a script it has no table for as before', () => {
    expect(libraryOf('http://localhost:3000/node_modules/.vite/deps/react-dom_client.js?v=1', 3)).toBe('react-dom');
    expect(relativeFile('webpack-internal:///(app-pages-browser)/./shared/Row.tsx')).toBe('shared/Row.tsx');
    expect(servedPath('webpack://app/./src/Row.tsx?')).toBe('src/Row.tsx');
  });
});

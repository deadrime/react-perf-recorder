import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { healthUrls } from '../../src/mcp/record';
import { ScriptCatalog, sourcePath } from '../../src/sources/scripts';

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
      version: 3,
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
});

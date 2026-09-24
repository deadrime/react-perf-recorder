// @vitest-environment node
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { createServer, type ViteDevServer } from 'vite';

const fixture = path.resolve(__dirname, '../e2e/fixture-app');
let server: ViteDevServer;
let base: string;
let outDir: string;
let listener: http.Server;

const post = (route: string, body: unknown, headers: Record<string, string> = { 'content-type': 'application/json', 'x-react-perf-recorder': '1' }) =>
  fetch(`${base}/__react-perf-recorder/${route}`, { method: 'POST', headers, body: typeof body === 'string' ? body : JSON.stringify(body) });

beforeAll(async () => {
  outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rpr-sessions-'));
  process.env.FIXTURE_OUT_DIR = outDir;
  server = await createServer({
    configFile: path.join(fixture, 'vite.config.ts'),
    logLevel: 'silent',
    server: { middlewareMode: true, watch: null },
    appType: 'custom',
  });
  listener = http.createServer(server.middlewares);
  await new Promise<void>((resolve) => listener.listen(0, resolve));
  base = `http://127.0.0.1:${(listener.address() as { port: number }).port}`;
}, 30_000);

afterAll(async () => {
  listener.closeAllConnections();
  listener.close();
  // The dependency optimizer can keep close() pending inside a Vitest worker; the process ends right after anyway.
  await Promise.race([server.close(), new Promise((resolve) => setTimeout(resolve, 3000))]);
  fs.rmSync(outDir, { recursive: true, force: true });
}, 10_000);

describe('perfRecorder vite plugin', () => {
  it('injects the entry first in <head>', async () => {
    const html = await server.transformIndexHtml('/index.html', fs.readFileSync(path.join(fixture, 'index.html'), 'utf8'));
    const head = html.slice(html.indexOf('<head>'), html.indexOf('</head>'));
    // Vite puts its own client first; ours must still come before any app module.
    expect(head).toContain('<script type="module" src="/@id/virtual:react-perf-recorder/entry"></script>');
    expect(html.indexOf('virtual:react-perf-recorder/entry')).toBeLessThan(html.indexOf('/src/main.tsx'));
  });

  it('puts the base in front of the entry once, for an app not served from the root', async () => {
    const site = await createServer({
      configFile: path.join(fixture, 'vite.pages.config.ts'),
      logLevel: 'silent',
      server: { middlewareMode: true, watch: null },
      appType: 'custom',
    });
    try {
      const html = await site.transformIndexHtml('/index.html', fs.readFileSync(path.join(fixture, 'index.html'), 'utf8'));
      expect(html).toContain('<script type="module" src="/react-perf-recorder/@id/virtual:react-perf-recorder/entry"></script>');
    } finally {
      await Promise.race([site.close(), new Promise((resolve) => setTimeout(resolve, 3000))]);
    }
  });

  it('proxies store and memoizer modules for app code only', async () => {
    const app = path.join(fixture, 'src/store/selectors.ts');
    expect((await server.pluginContainer.resolveId('proxy-memoize', app))?.id).toBe('\0react-perf-recorder:proxy-memoize:proxy-memoize');
    expect((await server.pluginContainer.resolveId('zustand', app))?.id).toBe('\0react-perf-recorder:zustand:zustand');
    const fromLib = await server.pluginContainer.resolveId('zustand', path.resolve(__dirname, '../../node_modules/zustand/esm/middleware.mjs'));
    expect(fromLib?.id.startsWith('\0')).toBe(false);
  });

  it("points the app's createRoot at the proxy, whatever the resolver would have done with it", async () => {
    // Rewritten in the source rather than caught when resolved: Vite answers a bare specifier from the optimizer
    // before any plugin of ours is asked whenever the app aliases `react-dom`, and the root would go unannounced.
    const main = await server.transformRequest('/src/main.tsx');
    expect(main?.code).toContain('/@id/__x00__react-perf-recorder:core:react-dom/client');
    expect(main?.code).not.toMatch(/from ["'][^"']*deps\/react-dom_client/);
    const id = '\0react-perf-recorder:core:react-dom/client';
    expect((await server.pluginContainer.resolveId(id, undefined))?.id).toBe(id);
    const proxy = await server.pluginContainer.load(id);
    expect(typeof proxy === 'string' ? proxy : proxy?.code).toContain('noteRoot(root)');
    // A module of a package keeps the original: only the app's own roots are announced.
    const fromLib = await server.pluginContainer.resolveId('react-dom/client', path.resolve(__dirname, '../../node_modules/react-dom/client.js'));
    expect(fromLib?.id.startsWith('\0')).toBe(false);
  });

  it('names selectors, stores and memo components', async () => {
    const selectors = await server.transformRequest('/src/store/selectors.ts');
    expect(selectors?.code).toContain('__rprNameMemoized(selectMessageIds, "selectMessageIds", "src/store/selectors.ts")');
    expect(selectors?.code).toContain('__rprNameMemoized(selectMessageInfo, "selectMessageInfo", "src/store/selectors.ts")');
    const store = await server.transformRequest('/src/store/chat.ts');
    expect(store?.code).toContain('__rprNameStore(useChatStore, "useChatStore")');
    expect(store?.code).toContain('__rprNameStore(presenceStore, "presenceStore")');
    const rows = await server.transformRequest('/src/components/Messages.tsx');
    expect(rows?.code).toContain('MessageRow.displayName = "MessageRow"');
  });

  it('writes a session: open, events, finish, with hook sites mapped to the source', async () => {
    const opened = await (
      await post('sessions', {
        source: 'panel',
        scope: { name: 'Panel', source: 'src/components/Header.tsx:1' },
        page: { url: 'x', title: '', viewport: '1×1', dpr: 1, userAgent: '' },
      })
    ).json();
    expect(opened.id).toMatch(/^\d{8}-\d{6}-Panel-panel-[0-9a-f]{4}$/);
    expect((await post(`sessions/${opened.id}/events`, { events: [{ k: 'commit', t: 1, n: 2 }] })).status).toBe(200);

    const call = 'useChatStore(selectUnread)';
    const header = (await server.transformRequest('/src/components/Header.tsx'))!;
    const lines = header.code.split('\n');
    const line = lines.findIndex((l) => l.includes(call)) + 1;
    const column = lines[line - 1].indexOf(call) + 1;
    const sourceLine =
      fs
        .readFileSync(path.join(fixture, 'src/components/Header.tsx'), 'utf8')
        .split('\n')
        .findIndex((l) => l.includes(call)) + 1;
    const recording = {
      schema: 'react-perf-recorder/recording',
      roots: [
        {
          name: 'Unread',
          hooks: { 0: { path: ['useUnread', 'useBoundStore'], generated: { url: `${base}/src/components/Header.tsx`, line, column } } },
        },
      ],
      outsideRoots: [],
    };
    const finished = await (await post(`sessions/${opened.id}/finish`, { recording })).json();
    const saved = JSON.parse(fs.readFileSync(path.join(finished.dir, 'recording.json'), 'utf8'));
    expect(saved.roots[0].hooks[0]).toMatchObject({
      site: `src/components/Header.tsx:${sourceLine}`,
      code: 'return useChatStore(selectUnread);',
    });
    const meta = JSON.parse(fs.readFileSync(path.join(finished.dir, 'session.json'), 'utf8'));
    expect(meta).toMatchObject({ status: 'done', events: 1 });
  });

  it('a stop that sends its last events before finishing is not an interrupted session', async () => {
    const opened = await (await post('sessions', { source: 'panel' })).json();
    // What a normal stop does: the queue, with the end event, goes out as events; finish comes after.
    expect((await post(`sessions/${opened.id}/events`, { events: [{ k: 'end', atMs: 5 }] })).status).toBe(200);
    const meta = JSON.parse(fs.readFileSync(path.join(outDir, opened.id, 'session.json'), 'utf8'));
    expect(meta.status).toBe('recording');
  });

  it('refuses writes without its header and lets a beacon in with the session token', async () => {
    expect((await post('sessions', {}, { 'content-type': 'text/plain' })).status).toBe(415);
    const opened = await (await post('sessions', { source: 'panel' })).json();
    const beacon = await fetch(`${base}/__react-perf-recorder/sessions/${opened.id}/events?token=${opened.token}&end=1`, {
      method: 'POST',
      headers: { 'content-type': 'text/plain' },
      body: JSON.stringify({ events: [{ k: 'end', atMs: 5 }] }),
    });
    expect(beacon.status).toBe(200);
    const meta = JSON.parse(fs.readFileSync(path.join(outDir, opened.id, 'session.json'), 'utf8'));
    expect(meta.status).toBe('interrupted');
    const wrongToken = await fetch(`${base}/__react-perf-recorder/sessions/${opened.id}/events?token=nope`, {
      method: 'POST',
      headers: { 'content-type': 'text/plain' },
      body: '{"events":[]}',
    });
    expect(wrongToken.status).toBe(415);
  });

  it('answers health with the sessions folder', async () => {
    expect(await (await fetch(`${base}/__react-perf-recorder/health`)).json()).toMatchObject({ ok: true, dir: outDir });
  });
});

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { RECORDING_SCHEMA, SCHEMA_VERSION } from '../../src/shared/schema';

/**
 * The path without Vite: a page that knows nothing of the recorder, and `engine.iife.js` put into it after the app
 * booted. It is the build in `dist` that is loaded, so a stale one — once it recorded a schema the MCP server no
 * longer read — fails here instead of in someone's hands. React 18 only: React 19 ships no UMD build to load.
 */
const ORIGIN = 'http://iife.local';
const file = (p: string) => readFileSync(path.resolve(p), 'utf8');

const PAGE = `<!doctype html><html><body><div id="root"></div>
<script src="/react.js"></script><script src="/react-dom.js"></script>
<script>
  const h = React.createElement;
  function Label({ n }) { return h('span', { 'data-testid': 'label' }, 'clicked ' + n); }
  function Counter() {
    const [n, setN] = React.useState(0);
    return h('div', null, h('button', { 'data-testid': 'more', onClick: () => setN(n + 1) }, 'more'), h(Label, { n }));
  }
  ReactDOM.createRoot(document.getElementById('root')).render(h(Counter));
</script></body></html>`;

test('engine.iife.js records a page without the plugin, in the schema of this version', async ({ page }, info) => {
  test.skip(info.project.name !== 'react18', 'React 19 has no UMD build');
  const assets: Record<string, string> = {
    '/': PAGE,
    '/react.js': file('node_modules/react/umd/react.development.js'),
    '/react-dom.js': file('node_modules/react-dom/umd/react-dom.development.js'),
  };
  await page.route(`${ORIGIN}/**`, (route) => {
    const body = assets[new URL(route.request().url()).pathname];
    return body === undefined
      ? route.fulfill({ status: 404 })
      : route.fulfill({ body, contentType: body === PAGE ? 'text/html' : 'text/javascript' });
  });
  await page.goto(`${ORIGIN}/`);
  await expect(page.getByTestId('label')).toHaveText('clicked 0');

  // Injected by hand after the app is up, as the README says to.
  await page.addScriptTag({ path: 'dist/engine.iife.js' });
  await page.evaluate(() => (window as any).__REACT_PERF_RECORDER__.engine.start({ label: 'iife' }));
  for (let i = 0; i < 3; i++) await page.getByTestId('more').click();
  await expect(page.getByTestId('label')).toHaveText('clicked 3');
  const rec = await page.evaluate(async () => {
    const r = await (window as any).__REACT_PERF_RECORDER__.engine.stop();
    return { schema: r.schema, version: r.version, roots: r.roots.map((x: any) => ({ name: x.name, hits: x.hits })), saveError: r.saveError };
  });

  expect(rec.schema).toBe(RECORDING_SCHEMA);
  expect(rec.version).toBe(SCHEMA_VERSION);
  expect(rec.roots).toContainEqual({ name: 'Counter', hits: 3 });
});

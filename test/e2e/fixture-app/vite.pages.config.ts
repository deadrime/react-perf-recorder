import fs from 'node:fs';
import path from 'node:path';
import react from '@vitejs/plugin-react-swc';
import { createServer, defineConfig, type Plugin, type ViteDevServer } from 'vite';
import { perfRecorder } from '../../../src/vite';
import { proxyMemoize } from '../../../src/plugins/proxy-memoize';
import { reactQuery } from '../../../src/plugins/react-query';
import { zustand } from '../../../src/plugins/zustand';
import { aliases } from './vite.config';

/** GitHub Pages answers an unknown path with 404.html: the app itself, which routes it. */
const spaFallback = (outDir: string): Plugin => ({
  name: 'spa-fallback',
  // Also called after a failed build, with no page to copy; its own error must not hide the build's.
  closeBundle: () => {
    const page = path.join(outDir, 'index.html');
    if (fs.existsSync(page)) fs.copyFileSync(page, path.join(outDir, '404.html'));
  },
});

const outDir = path.resolve(__dirname, '../../../dist-pages');

/** Orbit is a page of the built site (build:pages); under `dev:pages` its own dev server answers orbit/ in the same port. */
const orbitInDev = (): Plugin => {
  let orbit: ViteDevServer | undefined;
  return {
    name: 'orbit-in-dev',
    apply: 'serve',
    async configureServer(server) {
      const base = `${server.config.base}orbit/`;
      // No HMR: its socket would fight the site's over the one port.
      orbit = await createServer({
        configFile: path.resolve(__dirname, '../../eval-large/vite.config.ts'),
        base,
        server: { middlewareMode: true, hmr: false },
      });
      server.middlewares.use((req, res, next) => {
        if (req.url === base.slice(0, -1)) {
          res.writeHead(302, { location: base }).end();
          return;
        }
        if (req.url?.startsWith(base)) orbit!.middlewares(req, res, next);
        else next();
      });
    },
    async buildEnd() {
      await orbit?.close();
    },
  };
};

/**
 * The fixture as the project's site: the demo with the recorder on it and the docs, built for GitHub Pages. React is
 * the development build — the recorder reads what only it keeps (component files, hook types) — and a built site's
 * recordings stay in the tab, since there is no dev server to keep them.
 */
export default defineConfig(({ command }) => ({
  root: __dirname,
  base: process.env.PAGES_BASE ?? '/react-perf-recorder/',
  mode: 'development',
  // For the build only: the dev server has React's development build already, and pre-bundles it by itself.
  define: command === 'build' ? { 'process.env.NODE_ENV': JSON.stringify('development') } : {},
  resolve: { alias: aliases },
  // `npm run dev:pages` serves the site as it is built, under its base; the fixture's own server keeps 5391.
  server: { port: 5393 },
  cacheDir: path.resolve(__dirname, '../../../node_modules/.vite-pages'),
  // A module a file: in one bundle Rollup renames clashing names (three `Line`s become Line$1, Line$2), and a
  // component's name is what the recorder shows.
  build: {
    outDir,
    emptyOutDir: true,
    minify: false,
    sourcemap: false,
    rollupOptions: { preserveEntrySignatures: 'strict', output: { preserveModules: true } },
  },
  plugins: [
    react(),
    perfRecorder({
      enabled: true,
      // Under `dev:pages` recordings are kept where the fixture's own server keeps them.
      outDir: path.resolve(__dirname, '../../../.agent-artifacts/fixture-sessions'),
      plugins: [zustand(), proxyMemoize({ functions: ['memoize', 'memoizeWithArgs'] }), reactQuery()],
    }),
    spaFallback(outDir),
    orbitInDev(),
  ],
}));

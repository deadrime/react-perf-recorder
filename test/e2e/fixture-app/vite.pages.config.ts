import fs from 'node:fs';
import path from 'node:path';
import react from '@vitejs/plugin-react-swc';
import { defineConfig, type Plugin } from 'vite';
import { perfRecorder } from '../../../src/vite';
import { proxyMemoize } from '../../../src/plugins/proxy-memoize';
import { reactQuery } from '../../../src/plugins/react-query';
import { zustand } from '../../../src/plugins/zustand';
import { aliases } from './vite.config';

/** GitHub Pages answers an unknown path with 404.html: the app itself, which routes it. */
const spaFallback = (outDir: string): Plugin => ({
  name: 'spa-fallback',
  closeBundle: () => fs.copyFileSync(path.join(outDir, 'index.html'), path.join(outDir, '404.html')),
});

const outDir = path.resolve(__dirname, '../../../dist-pages');

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
  build: { outDir, emptyOutDir: true, minify: false, sourcemap: false },
  plugins: [
    react(),
    perfRecorder({
      enabled: true,
      // Under `dev:pages` recordings are kept where the fixture's own server keeps them.
      outDir: path.resolve(__dirname, '../../../.agent-artifacts/fixture-sessions'),
      plugins: [zustand(), proxyMemoize({ functions: ['memoize', 'memoizeWithArgs'] }), reactQuery()],
    }),
    spaFallback(outDir),
  ],
}));

import path from 'node:path';
import react from '@vitejs/plugin-react-swc';
import { defineConfig, type Plugin } from 'vite';
import { perfRecorder } from '../../../src/vite';
import { proxyMemoize } from '../../../src/plugins/proxy-memoize';
import { reactQuery } from '../../../src/plugins/react-query';
import { redux } from '../../../src/plugins/redux';
import { zustand } from '../../../src/plugins/zustand';
import { react19Aliases, reactVersionUnderTest } from '../../react-19';

const src = path.resolve(__dirname, '../../../src');

export const aliases = [
  { find: 'react-perf-recorder/client', replacement: `${src}/client/index.ts` },
  { find: 'react-perf-recorder/runtime', replacement: `${src}/runtime/index.ts` },
  { find: /^react-perf-recorder\/plugins\/([\w-]+)\/runtime$/, replacement: `${src}/plugins/$1/runtime.ts` },
];

const react19 = reactVersionUnderTest() === '19';

// Chrome takes no image with under 0.05 bits a pixel for content: a flat rectangle never becomes the LCP.
const PHOTO = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="320">${Array.from(
  { length: 160 },
  (_, i) =>
    `<rect x="${(i * 37) % 640}" y="${(i * 53) % 320}" width="${20 + (i % 40)}" height="${10 + (i % 30)}" fill="#${(
      ((i * 2654435761) >>> 8) &
      0xffffff
    )
      .toString(16)
      .padStart(6, '0')}"/>`
).join('')}</svg>`;

/** The photo of the LCP tests, answered after `?ms=` like a slow image server. */
const slowPhoto = (): Plugin => ({
  name: 'fixture-slow-photo',
  configureServer(server) {
    server.middlewares.use('/__lcp/photo.svg', (req, res) => {
      const ms = Number(new URL(req.url ?? '/', 'http://x').searchParams.get('ms') ?? 0);
      setTimeout(() => {
        res.writeHead(200, { 'content-type': 'image/svg+xml', 'cache-control': 'no-store' });
        res.end(PHOTO);
      }, ms);
    });
  },
});

export default defineConfig({
  root: __dirname,
  // One cache per React, so the two fixture servers of a matrix run never share a pre-bundle.
  cacheDir: path.resolve(__dirname, `../../../node_modules/.vite-fixture-${reactVersionUnderTest()}`),
  resolve: { alias: [...(react19 ? react19Aliases : []), ...aliases] },
  server: { port: Number(process.env.FIXTURE_PORT ?? 5391), strictPort: true },
  plugins: [
    slowPhoto(),
    react(),
    perfRecorder({
      enabled: true,
      outDir: process.env.FIXTURE_OUT_DIR ?? path.resolve(__dirname, '../../../.agent-artifacts/fixture-sessions'),
      plugins: [zustand(), proxyMemoize({ functions: ['memoize', 'memoizeWithArgs'] }), reactQuery(), redux()],
    }),
  ],
});

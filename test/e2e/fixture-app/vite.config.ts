import path from 'node:path';
import react from '@vitejs/plugin-react-swc';
import { defineConfig } from 'vite';
import { perfRecorder } from '../../../src/vite';
import { proxyMemoize } from '../../../src/plugins/proxy-memoize';
import { reactQuery } from '../../../src/plugins/react-query';
import { zustand } from '../../../src/plugins/zustand';
import { react19Aliases, reactVersionUnderTest } from '../../react-19';

const src = path.resolve(__dirname, '../../../src');

export const aliases = [
  { find: 'react-perf-recorder/client', replacement: `${src}/client/index.ts` },
  { find: 'react-perf-recorder/runtime', replacement: `${src}/runtime/index.ts` },
  { find: /^react-perf-recorder\/plugins\/([\w-]+)\/runtime$/, replacement: `${src}/plugins/$1/runtime.ts` },
];

const react19 = reactVersionUnderTest() === '19';

export default defineConfig({
  root: __dirname,
  // One cache per React, so the two fixture servers of a matrix run never share a pre-bundle.
  cacheDir: path.resolve(__dirname, `../../../node_modules/.vite-fixture-${reactVersionUnderTest()}`),
  resolve: { alias: [...(react19 ? react19Aliases : []), ...aliases] },
  server: { port: Number(process.env.FIXTURE_PORT ?? 5391), strictPort: true },
  plugins: [
    react(),
    perfRecorder({
      enabled: true,
      outDir: process.env.FIXTURE_OUT_DIR ?? path.resolve(__dirname, '../../../.agent-artifacts/fixture-sessions'),
      plugins: [zustand(), proxyMemoize({ functions: ['memoize', 'memoizeWithArgs'] }), reactQuery()],
    }),
  ],
});

import path from 'node:path';
import react from '@vitejs/plugin-react-swc';
import { defineConfig } from 'vite';
import { perfRecorder } from '../../../src/vite';
import { proxyMemoize } from '../../../src/plugins/proxy-memoize';
import { reactQuery } from '../../../src/plugins/react-query';
import { zustand } from '../../../src/plugins/zustand';

const src = path.resolve(__dirname, '../../../src');

export const aliases = [
  { find: 'react-perf-recorder/client', replacement: `${src}/client/index.ts` },
  { find: 'react-perf-recorder/runtime', replacement: `${src}/runtime/index.ts` },
  { find: /^react-perf-recorder\/plugins\/([\w-]+)\/runtime$/, replacement: `${src}/plugins/$1/runtime.ts` },
];

export default defineConfig({
  root: __dirname,
  resolve: { alias: aliases },
  server: { port: Number(process.env.FIXTURE_PORT ?? 5391), strictPort: true },
  plugins: [
    react(),
    perfRecorder({
      enabled: true,
      outDir: process.env.FIXTURE_OUT_DIR ?? path.resolve(__dirname, '../../../.agent-artifacts/fixture-sessions'),
      plugins: [zustand(), proxyMemoize(), reactQuery()],
    }),
  ],
});

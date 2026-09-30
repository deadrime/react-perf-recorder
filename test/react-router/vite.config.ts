import path from 'node:path';
import { reactRouter } from '@react-router/dev/vite';
import { defineConfig } from 'vite';
import { perfRecorder } from 'react-perf-recorder/vite';
import { zustand } from 'react-perf-recorder/plugins/zustand';

export default defineConfig({
  server: { port: Number(process.env.FIXTURE_PORT ?? 5394), strictPort: true },
  plugins: [
    perfRecorder({
      outDir: process.env.FIXTURE_OUT_DIR ?? path.resolve(__dirname, '../../.agent-artifacts/fixture-sessions'),
      plugins: [zustand()],
    }),
    reactRouter(),
  ],
});

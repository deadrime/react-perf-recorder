import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import react from '@vitejs/plugin-react-swc';
import { defineConfig } from 'vite';
import { perfRecorder } from '../../src/vite';
import { proxyMemoize } from '../../src/plugins/proxy-memoize';
import { reactQuery } from '../../src/plugins/react-query';
import { redux } from '../../src/plugins/redux';
import { zustand } from '../../src/plugins/zustand';
import { aliases } from '../e2e/fixture-app/vite.config';

// The large app, or a copy of it with a bug patched in (RPR_WORKSPACE), served with the recorder.
//   npx vite --config test/eval-large/vite.config.ts      → http://localhost:5394/?tick=150
const workspace = process.env.RPR_WORKSPACE ?? path.join(__dirname, 'app');
const repo = path.resolve(__dirname, '../..');

export default defineConfig({
  root: workspace,
  cacheDir: path.join(os.tmpdir(), 'rpr-eval-large-vite', createHash('sha1').update(workspace).digest('hex').slice(0, 12)),
  resolve: { alias: aliases },
  // Shared by many workspaces (check.mjs), the dependencies are bundled up front: one found later reloads every page.
  ...(process.env.RPR_SHARED
    ? {
        optimizeDeps: {
          include: [
            'react',
            'react-dom',
            'react-dom/client',
            'react/jsx-dev-runtime',
            'react/jsx-runtime',
            'zustand',
            'zustand/vanilla',
            'zustand/middleware',
            'zustand/react/shallow',
            'react-hook-form',
            '@tanstack/react-query',
            'react-router-dom',
            'proxy-memoize',
            '@reduxjs/toolkit',
            'react-redux',
            // the recorder's panel
            'preact',
            'preact/hooks',
            'preact/jsx-dev-runtime',
          ],
        },
      }
    : {}),
  server: {
    port: Number(process.env.RPR_PORT ?? 5394),
    strictPort: true,
    fs: { allow: [workspace, repo] },
    ...(process.env.RPR_SHARED ? { hmr: false, watch: null } : {}),
  },
  logLevel: 'warn',
  plugins: [
    react(),
    perfRecorder({
      enabled: true,
      outDir: process.env.RPR_SESSIONS ?? path.join(repo, '.agent-artifacts/eval-large-sessions'),
      // Shared, the root holds the workspaces, each with its own src.
      ...(process.env.RPR_SHARED ? { components: { include: ['*/src/**/*.{tsx,jsx}'] } } : {}),
      plugins: [zustand(), proxyMemoize({ functions: ['memoize'] }), reactQuery(), redux()],
    }),
  ],
});

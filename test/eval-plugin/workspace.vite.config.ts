import { createHash } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import react from '@vitejs/plugin-react-swc';
import { defineConfig } from 'vite';
import { perfRecorder } from '../../src/vite';
import { proxyMemoize } from '../../src/plugins/proxy-memoize';
import { reactQuery } from '../../src/plugins/react-query';
import { redux } from '../../src/plugins/redux';
import { zustand } from '../../src/plugins/zustand';
import { aliases } from '../e2e/fixture-app/vite.config';

// An eval run's workspace served as the fixture is: the agent's edits reload in the page it records.
const workspace = process.env.RPR_WORKSPACE!;
const repo = path.resolve(__dirname, '../..');

export default defineConfig({
  root: workspace,
  // One pre-bundle per workspace: runs side by side never share one.
  cacheDir: path.join(os.tmpdir(), 'rpr-eval-vite', createHash('sha1').update(workspace).digest('hex').slice(0, 12)),
  resolve: { alias: aliases },
  // A server shared by many workspaces bundles their dependencies up front: one found later would reload every page.
  ...(process.env.RPR_SHARED
    ? {
        optimizeDeps: {
          include: [
            'react',
            'react-dom',
            'react-dom/client',
            'react/jsx-dev-runtime',
            'zustand',
            'zustand/vanilla',
            'zustand/middleware',
            'zustand/shallow',
            'zustand/react/shallow',
            'react-hook-form',
            '@tanstack/react-query',
            'react-router-dom',
            'proxy-memoize',
          ],
        },
      }
    : {}),
  server: {
    port: Number(process.env.RPR_PORT),
    strictPort: true,
    fs: { allow: [workspace, repo] },
    // Shared by many workspaces, the server must not reload every page when the next one is copied in: nothing in a
    // workspace changes while it is recorded.
    ...(process.env.RPR_SHARED ? { hmr: false, watch: null } : {}),
  },
  logLevel: 'warn',
  plugins: [
    react(),
    perfRecorder({
      enabled: true,
      outDir: process.env.RPR_SESSIONS!,
      plugins: [zustand(), proxyMemoize({ functions: ['memoize', 'memoizeWithArgs'] }), reactQuery(), redux()],
    }),
  ],
});

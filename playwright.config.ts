import os from 'node:os';
import path from 'node:path';
import { defineConfig } from '@playwright/test';

export const SESSIONS_DIR = process.env.FIXTURE_OUT_DIR ?? path.join(os.tmpdir(), 'rpr-e2e-sessions');
process.env.FIXTURE_OUT_DIR = SESSIONS_DIR;

export default defineConfig({
  testDir: 'test/e2e',
  outputDir: '.agent-artifacts/e2e-results',
  workers: 1,
  use: { baseURL: 'http://localhost:5391', headless: true, viewport: { width: 1280, height: 800 } },
  webServer: {
    command: 'npx vite --config test/e2e/fixture-app/vite.config.ts',
    url: 'http://localhost:5391',
    reuseExistingServer: false,
    env: { FIXTURE_OUT_DIR: SESSIONS_DIR, FIXTURE_PORT: '5391' },
    timeout: 60_000,
  },
});

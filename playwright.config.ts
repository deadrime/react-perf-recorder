import os from 'node:os';
import path from 'node:path';
import { defineConfig } from '@playwright/test';

export const SESSIONS_DIR = process.env.FIXTURE_OUT_DIR ?? path.join(os.tmpdir(), 'rpr-e2e-sessions');
process.env.FIXTURE_OUT_DIR = SESSIONS_DIR;

/**
 * One fixture server per React; the projects run one after another, each against its own. Playwright starts every
 * server whichever project is asked for, so the ports can be moved when one of them is busy with a fixture by hand.
 */
const PORTS = {
  react18: Number(process.env.FIXTURE_PORT ?? 5391),
  react19: Number(process.env.FIXTURE_PORT_19 ?? 5392),
};

const fixture = (port: number, react19: boolean) => ({
  command: 'npx vite --config test/e2e/fixture-app/vite.config.ts',
  url: `http://localhost:${port}`,
  reuseExistingServer: false,
  env: { FIXTURE_OUT_DIR: SESSIONS_DIR, FIXTURE_PORT: String(port), ...(react19 ? { RPR_REACT: '19' } : {}) },
  timeout: 60_000,
});

/** One React only, when CI runs the two as jobs side by side: only its dev server is started. */
const only = process.env.E2E_PROJECT;
const projects = [
  { name: 'react18', use: { baseURL: `http://localhost:${PORTS.react18}` }, server: fixture(PORTS.react18, false) },
  { name: 'react19', use: { baseURL: `http://localhost:${PORTS.react19}` }, server: fixture(PORTS.react19, true) },
].filter((p) => !only || p.name === only);

export default defineConfig({
  testDir: 'test/e2e',
  globalSetup: './test/e2e/global-setup.ts',
  outputDir: '.agent-artifacts/e2e-results',
  // Files run side by side; a test finds its recording by the id it was saved under, not by what is new in the folder.
  workers: process.env.CI ? 2 : 4,
  use: { headless: true, viewport: { width: 1280, height: 800 } },
  projects: projects.map(({ name, use }) => ({ name, use })),
  webServer: projects.map((p) => p.server),
});

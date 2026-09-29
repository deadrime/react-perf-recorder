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
  reactRouter: Number(process.env.FIXTURE_PORT_RR ?? 5394),
  bare18: Number(process.env.FIXTURE_PORT_BARE ?? 5395),
  bare19: Number(process.env.FIXTURE_PORT_BARE_19 ?? 5396),
  webpack: Number(process.env.FIXTURE_PORT_WEBPACK ?? 5397),
  webpackMaps: Number(process.env.FIXTURE_PORT_WEBPACK_MAPS ?? 5398),
  rsbuild: Number(process.env.FIXTURE_PORT_RSBUILD ?? 5399),
};

const fixture = (port: number, react19: boolean, config = 'vite.config.ts') => ({
  command: `npx vite --config test/e2e/fixture-app/${config}`,
  url: `http://localhost:${port}`,
  reuseExistingServer: false,
  env: { FIXTURE_OUT_DIR: SESSIONS_DIR, FIXTURE_PORT: String(port), ...(react19 ? { RPR_REACT: '19' } : {}) },
  timeout: 60_000,
});

/** One React only, when CI runs the two as jobs side by side: only its dev server is started. */
const only = process.env.E2E_PROJECT;
const REACT_ROUTER_SPEC = /react-router\.spec\.ts$/;
// The same app with no recorder in its build: record_page brings it in.
const BARE_SPEC = /bare\.spec\.ts$/;
// test/bundlers, with its own packages: `npm ci --prefix test/bundlers` first.
const BUNDLERS_SPEC = /bundlers\.spec\.ts$/;
const OWN_FIXTURE = [REACT_ROUTER_SPEC, BARE_SPEC, BUNDLERS_SPEC];
const bundler = (name: string, port: number, command: string, env: Record<string, string> = {}) => ({
  name,
  use: { baseURL: `http://localhost:${port}` },
  testMatch: BUNDLERS_SPEC,
  server: {
    command,
    cwd: 'test/bundlers',
    url: `http://localhost:${port}`,
    reuseExistingServer: false,
    env: { FIXTURE_PORT: String(port), ...env },
    timeout: 60_000,
  },
});
const projects = [
  { name: 'react18', use: { baseURL: `http://localhost:${PORTS.react18}` }, server: fixture(PORTS.react18, false), testIgnore: OWN_FIXTURE },
  { name: 'react19', use: { baseURL: `http://localhost:${PORTS.react19}` }, server: fixture(PORTS.react19, true), testIgnore: OWN_FIXTURE },
  {
    name: 'bare18',
    use: { baseURL: `http://localhost:${PORTS.bare18}` },
    server: fixture(PORTS.bare18, false, 'vite.bare.config.ts'),
    testMatch: BARE_SPEC,
  },
  {
    name: 'bare19',
    use: { baseURL: `http://localhost:${PORTS.bare19}` },
    server: fixture(PORTS.bare19, true, 'vite.bare.config.ts'),
    testMatch: BARE_SPEC,
  },
  {
    // An app that renders its own HTML, served by its framework with the recorder as built: `npm run build` first.
    name: 'react-router',
    use: { baseURL: `http://localhost:${PORTS.reactRouter}` },
    testMatch: REACT_ROUTER_SPEC,
    metadata: { warm: '/' },
    server: {
      command: 'npx react-router dev',
      cwd: 'test/react-router',
      url: `http://localhost:${PORTS.reactRouter}`,
      reuseExistingServer: false,
      env: { FIXTURE_OUT_DIR: SESSIONS_DIR, FIXTURE_PORT: String(PORTS.reactRouter) },
      timeout: 60_000,
    },
  },
  bundler('webpack', PORTS.webpack, 'npx webpack serve'),
  bundler('webpack-maps', PORTS.webpackMaps, 'npx webpack serve', { DEVTOOL: 'eval-source-map' }),
  bundler('rsbuild', PORTS.rsbuild, 'npx rsbuild dev'),
].filter((p) => !only || p.name === only);

export default defineConfig({
  testDir: 'test/e2e',
  globalSetup: './test/e2e/global-setup.ts',
  outputDir: '.agent-artifacts/e2e-results',
  // Files run side by side; a test finds its recording by the id it was saved under, not by what is new in the folder.
  workers: process.env.CI ? 2 : 4,
  use: { headless: true, viewport: { width: 1280, height: 800 } },
  projects: projects.map(({ server: _, ...project }) => project),
  webServer: projects.map((p) => p.server),
});

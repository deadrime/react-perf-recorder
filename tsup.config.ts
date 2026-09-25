import { readFileSync } from 'node:fs';
import { defineConfig } from 'tsup';

const { version } = JSON.parse(readFileSync('./package.json', 'utf8'));
const define = { __VERSION__: JSON.stringify(version) };

export default defineConfig([
  {
    // vite.config.ts of a project without "type": "module" is bundled to CJS and requires its plugins: ship both formats.
    entry: {
      vite: 'src/vite/index.ts',
      'plugins/zustand': 'src/plugins/zustand/index.ts',
      'plugins/proxy-memoize': 'src/plugins/proxy-memoize/index.ts',
      'plugins/react-query': 'src/plugins/react-query/index.ts',
      'plugins/redux': 'src/plugins/redux/index.ts',
    },
    outDir: 'dist/node',
    format: ['esm', 'cjs'],
    platform: 'node',
    target: 'node18',
    dts: true,
    external: ['vite'],
    noExternal: ['@jridgewell/trace-mapping'],
    shims: true,
    define,
  },
  {
    entry: { cli: 'src/mcp/cli.ts' },
    outDir: 'dist',
    format: ['esm'],
    platform: 'node',
    target: 'node18',
    // The MCP server runs from a file: link too, where npm does not install the package's dependencies.
    noExternal: [/.*/],
    // …except the browser: `record` resolves it from the project that is being measured, or says it is not there.
    external: ['playwright', 'playwright-core'],
    banner: {
      js: "#!/usr/bin/env node\nimport { createRequire as __rprCreateRequire } from 'node:module';\nconst require = __rprCreateRequire(import.meta.url);",
    },
    define,
  },
  {
    entry: {
      client: 'src/client/index.ts',
      runtime: 'src/runtime/index.ts',
      'plugins/zustand': 'src/plugins/zustand/runtime.ts',
      'plugins/proxy-memoize': 'src/plugins/proxy-memoize/runtime.ts',
      'plugins/react-query': 'src/plugins/react-query/runtime.ts',
      'plugins/redux': 'src/plugins/redux/runtime.ts',
    },
    outDir: 'dist/browser',
    format: ['esm'],
    platform: 'browser',
    target: 'es2021',
    dts: true,
    splitting: true,
    define,
  },
  {
    entry: { 'engine.iife': 'src/iife/engine.ts' },
    outDir: 'dist',
    format: ['iife'],
    platform: 'browser',
    target: 'es2021',
    outExtension: () => ({ js: '.js' }),
    define,
  },
]);

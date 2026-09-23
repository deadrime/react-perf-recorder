import { defineConfig } from 'vitest/config';
import { react19UnitAliases } from './test/react-19';

/** The unit suite against React 19: `npm run test:19`. The tree it resolves to is `test/react19`. */
export default defineConfig({
  resolve: { alias: react19UnitAliases },
  test: {
    globals: true,
    environment: 'happy-dom',
    include: ['test/unit/**/*.test.{ts,tsx}'],
    setupFiles: ['test/setup.ts'],
  },
});

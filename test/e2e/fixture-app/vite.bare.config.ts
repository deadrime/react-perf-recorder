import path from 'node:path';
import react from '@vitejs/plugin-react-swc';
import { defineConfig } from 'vite';
import { react19Aliases, reactVersionUnderTest } from '../../react-19';
import { aliases } from './vite.config';

const react19 = reactVersionUnderTest() === '19';

/** The same app with nothing of the recorder in its build: record_page has to bring the recorder in itself. */
export default defineConfig({
  root: __dirname,
  cacheDir: path.resolve(__dirname, `../../../node_modules/.vite-fixture-bare-${reactVersionUnderTest()}`),
  resolve: { alias: [...(react19 ? react19Aliases : []), ...aliases] },
  server: { port: Number(process.env.FIXTURE_PORT ?? 5395), strictPort: true },
  plugins: [react()],
});

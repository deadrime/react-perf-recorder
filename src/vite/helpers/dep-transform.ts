import fs from 'node:fs';
import type { PerfRecorderPlugin } from '../plugin-api';
import { cleanId } from './filter';

type DepTransform = NonNullable<NonNullable<PerfRecorderPlugin['vite']>['transformDep']>;

/** The dependency's file served as it is: from node_modules when it is not optimized, or a linked package. */
export function transformServedDep(dep: DepTransform, code: string, id: string): string | null {
  const file = cleanId(id);
  if (id.startsWith('\0') || !dep.filter.test(file)) return null;
  return dep.transform(code, file) ?? null;
}

/**
 * `optimizeDeps` for the same transform inside the dependency optimizer, which runs no Vite plugins: Rolldown's own
 * plugin from Vite 8 (`this.meta.rolldownVersion` is set there), an esbuild plugin before it.
 */
export function optimizeDepsFor(name: string, dep: DepTransform, rolldown: boolean) {
  if (rolldown) return { rolldownOptions: { plugins: [{ name, transform: (code: string, id: string) => transformServedDep(dep, code, id) }] } };
  const esbuildPlugin = {
    name,
    setup(build: { onLoad(options: { filter: RegExp }, cb: (args: { path: string }) => unknown): void }) {
      build.onLoad({ filter: dep.filter }, ({ path }) => {
        const out = dep.transform(fs.readFileSync(path, 'utf8'), cleanId(path));
        return out == null ? undefined : { contents: out, loader: 'js' };
      });
    },
  };
  return { esbuildOptions: { plugins: [esbuildPlugin] } };
}

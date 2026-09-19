import path from 'node:path';
import type { JsonValue } from '../shared/schema';

export const ENTRY_ID = 'virtual:react-perf-recorder/entry';
export const RESOLVED_ENTRY_ID = `\0${ENTRY_ID}`;

/** Import specifier for a runtime module: bare specifiers as is, files inside the root as `/path`, others via `/@fs/`. */
export function runtimeSpecifier(module: string, root: string): string {
  if (!path.isAbsolute(module)) return module;
  const rel = path.relative(root, module).replace(/\\/g, '/');
  return rel.startsWith('..') ? `/@fs${module.replace(/\\/g, '/')}` : `/${rel}`;
}

export function entryCode(clientModule: string, config: JsonValue, runtimes: Array<{ module: string; options?: JsonValue }>): string {
  const imports = runtimes.map((r, i) => `import plugin${i} from ${JSON.stringify(r.module)};`);
  const list = runtimes.map((r, i) => `[plugin${i}, ${JSON.stringify(r.options ?? null)}]`).join(', ');
  return [
    `import { boot } from ${JSON.stringify(clientModule)};`,
    ...imports,
    `boot(${JSON.stringify(config)}, [${list}], import.meta.hot);`,
    // Keep the entry alive across HMR: booting twice would install the commit hook twice.
    `if (import.meta.hot) import.meta.hot.accept(() => {});`,
  ].join('\n');
}

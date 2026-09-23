import type { JsonValue } from '../shared/schema';

export interface BuildContext {
  /** Project root, known after Vite resolves the config. */
  root(): string;
}

type Loose = Record<string, any>;

/**
 * A Vite plugin described structurally: the public types never import `vite`, so a linked or hoisted copy of the
 * package with its own Vite and Rollup versions still type-checks against the project's Vite 5–7.
 */
export interface VitePluginLike {
  name: string;
  enforce?: 'pre' | 'post';
  apply?: (config: any, env: { command: string; mode: string }) => boolean;
  config?: (config: any, env?: any) => Loose | void;
  configResolved?: (config: any) => void;
  resolveId?: (source: string, importer?: string, options?: any) => string | null;
  load?: (id: string) => string | null;
  transform?: (code: string, id: string) => { code: string; map: null } | null;
  transformIndexHtml?: () => Array<{ tag: string; attrs?: Record<string, string>; injectTo?: 'head' | 'body' | 'head-prepend' | 'body-prepend' }>;
  configureServer?: (server: any) => void;
}

/**
 * A plugin of the recorder. Both halves are optional: `vite` hooks run only in the dev server, `runtime` is a module
 * imported into the page before the app, whose default export is a `definePlugin` factory called with `options`.
 */
export interface PerfRecorderPlugin {
  name: string;
  vite?: {
    config?: (config: Loose) => Loose | void;
    resolveId?: (source: string, importer: string | undefined) => string | null | undefined;
    load?: (id: string) => string | null | undefined;
    transform?: (code: string, id: string) => { code: string; map: null } | string | null | undefined;
  };
  runtime?: { module: string; options?: JsonValue };
  /** Receives the core's context once the config is resolved. */
  init?: (ctx: BuildContext) => void;
}

export const definePerfRecorderPlugin = (plugin: PerfRecorderPlugin) => plugin;

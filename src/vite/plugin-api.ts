import type { Plugin, UserConfig } from 'vite';
import type { JsonValue } from '../shared/schema';

export interface BuildContext {
  /** Project root, known after Vite resolves the config. */
  root(): string;
}

/**
 * A plugin of the recorder. Both halves are optional: `vite` hooks run only in the dev server (the core wraps them
 * with `apply: serve`), `runtime` is a module imported into the page before the app, whose default export is a
 * `definePlugin` factory called with `options`.
 */
export interface PerfRecorderPlugin {
  name: string;
  vite?: {
    config?: (config: UserConfig) => UserConfig | void;
    resolveId?: (source: string, importer: string | undefined) => string | null | undefined;
    load?: (id: string) => string | null | undefined;
    transform?: (code: string, id: string) => { code: string; map: null } | string | null | undefined;
  };
  runtime?: { module: string; options?: JsonValue };
  /** Receives the core's context once the config is resolved. */
  init?: (ctx: BuildContext) => void;
}

export const definePerfRecorderPlugin = (plugin: PerfRecorderPlugin) => plugin;

export type { Plugin };

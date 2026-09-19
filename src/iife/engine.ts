import { Engine } from '../core/engine';
import { PluginHost } from '../core/plugins';
import { GLOBAL_KEY } from '../shared/schema';

declare const __VERSION__: string;

// For pages without the Vite plugin (a static build, another bundler): the core only, no plugins, no panel, no saving.
const target = window as unknown as Record<string, unknown>;
if (!target[GLOBAL_KEY]) {
  const engine = new Engine(
    {
      version: typeof __VERSION__ === 'string' ? __VERSION__ : 'dev',
      projectRoot: '',
      wrapperPattern: '^(Anonymous|ForwardRef|Memo)$',
      actions: { values: false, secretSelector: '' },
      maxDurationMs: 600_000,
      bigCommit: 150,
      timelineLimit: 5000,
      endpoint: null,
    },
    new PluginHost([])
  );
  target[GLOBAL_KEY] = { version: engine.version, engine, panel: null };
}

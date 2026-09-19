import { Engine, type BootConfig } from '../core/engine';
import { PluginHost, type PluginEntry } from '../core/plugins';
import { SessionWriter } from '../core/transport';
import { Highlighter } from '../overlay/highlight';
import { GLOBAL_KEY } from '../shared/schema';
import { Panel } from '../ui/panel';
import type { Corner } from '../ui/storage';

export interface ClientConfig extends BootConfig {
  panel: false | { corner: Corner; highlight: boolean; shortcuts: { record: string; pick: string } };
}

interface HotContext {
  on(event: string, cb: (payload: any) => void): void;
}

export interface RecorderGlobal {
  version: string;
  engine: Engine;
  panel: Panel | null;
}

declare global {
  interface Window {
    [GLOBAL_KEY]?: RecorderGlobal;
  }
}

/** Called by the virtual entry the Vite plugin injects at the top of <head>: runs before the app's modules. */
export function boot(config: ClientConfig, plugins: PluginEntry[], hot?: HotContext): RecorderGlobal {
  const existing = window[GLOBAL_KEY];
  if (existing) return existing;
  const host = new PluginHost(plugins);
  host.setupAll();
  const engine = new Engine(config, host);
  let panel: Panel | null = null;
  if (config.panel) {
    const interrupted = SessionWriter.takeInterrupted();
    panel = new Panel(engine, { ...config.panel, interrupted });
    const highlighter = new Highlighter(panel.shadowRoot);
    panel.setHighlighter(highlighter);
    engine.attachUi(highlighter, panel.host);
    panel.mount();
  }
  hot?.on('vite:beforeUpdate', (payload: { updates?: Array<{ path: string }> }) =>
    engine.noteHmr(
      'update',
      (payload?.updates ?? []).map((u) => u.path)
    )
  );
  hot?.on('vite:beforeFullReload', () => engine.interrupt());
  window.addEventListener('pagehide', () => engine.interrupt());
  const api: RecorderGlobal = { version: config.version, engine, panel };
  window[GLOBAL_KEY] = api;
  return api;
}

export type { BootConfig } from '../core/engine';

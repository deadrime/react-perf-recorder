import { Engine, type BootConfig } from '../core/engine';
import { captureRenderers } from '../core/fiber';
import { PluginHost, type PluginEntry } from '../core/plugins';
import { installTimers } from '../core/env/timers';
import { onRootCreated } from '../core/roots-notify';
import { SessionWriter } from '../core/transport';
import { Highlighter } from '../overlay/highlight';
import { GLOBAL_KEY } from '../shared/schema';
import { actionText, hookText, reasonLine, summarize } from '../shared/summary';
import { Panel } from '../ui/panel';

const format = { summarize, reasonLine, hookText, actionText };
import { takeRecordOnLoad, type Corner } from '../ui/storage';

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
  /** The same formatting as the panel and the MCP server, for scripts that print their own answer. */
  format: typeof format;
}

declare global {
  interface Window {
    [GLOBAL_KEY]?: RecorderGlobal;
  }
}

/**
 * `?rpr=rec` records from the page's first commit. The engine boots before React, so it waits for a root to
 * appear; a cascade on mount is otherwise impossible to catch by hand.
 */
function recordFromLoad(engine: Engine, pending: { names?: string[]; label?: string } | null) {
  const deadline = Date.now() + 15_000;
  const tick = () => {
    if (engine.recording) return;
    try {
      engine.start({ source: 'load', label: pending?.label || 'from page load', scope: pending?.names ? { names: pending.names } : null });
    } catch (error) {
      // No root yet, or the area is not mounted yet: the proxy of createRoot and the poll try again.
      if (Date.now() < deadline) setTimeout(tick, 0);
      else console.warn('[react-perf-recorder] nothing to record from load:', (error as Error)?.message ?? error);
    }
  };
  const off = onRootCreated(() => tick());
  setTimeout(off, 20_000);
  tick();
}

/** Called by the virtual entry the Vite plugin injects at the top of <head>: runs before the app's modules. */
export function boot(config: ClientConfig, plugins: PluginEntry[], hot?: HotContext): RecorderGlobal {
  const existing = window[GLOBAL_KEY];
  if (existing) return existing;
  captureRenderers();
  if (config.timers !== false) installTimers();
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
  const pending = takeRecordOnLoad();
  if (pending || new URLSearchParams(location.search).get('rpr') === 'rec') recordFromLoad(engine, pending);
  hot?.on('vite:beforeUpdate', (payload: { updates?: Array<{ path: string }> }) =>
    engine.noteHmr(
      'update',
      (payload?.updates ?? []).map((u) => u.path)
    )
  );
  hot?.on('vite:beforeFullReload', () => engine.interrupt());
  window.addEventListener('pagehide', () => engine.interrupt());
  const api: RecorderGlobal = { version: config.version, engine, panel, format };
  window[GLOBAL_KEY] = api;
  return api;
}

export type { BootConfig } from '../core/engine';

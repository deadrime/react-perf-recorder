import { Engine, type BootConfig } from '../core/engine';
import { captureRenderers, onSitesMapped, setSiteMapper, type Position } from '../core/fiber';
import { PluginHost, type PluginEntry } from '../core/plugins';
import { installTimers } from '../core/env/timers';
import { onRootCreated } from '../core/roots-notify';
import { SessionWriter } from '../core/transport';
import { Highlighter } from '../overlay/highlight';
import { CLIENT_HEADER, GLOBAL_KEY } from '../shared/schema';
import { actionText, hookText, reasonLine, summarize } from '../shared/summary';
import { Panel } from '../ui/panel';
import type { ReplayPlan } from '../shared/replay';
import { replay, ReplayError } from './replay';

const format = { summarize, reasonLine, hookText, actionText };
import { takeRecordOnLoad, type Corner, type RecordOnLoad } from '../ui/storage';

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
  /** Does the steps of a recording again while one is being recorded; `record_page` calls it for a replay. */
  replay(plan: ReplayPlan): Promise<void>;
}

declare global {
  interface Window {
    [GLOBAL_KEY]?: RecorderGlobal;
  }
}

/**
 * React 19 gives a component's site as a position in the module the dev server built; only the server holds the map
 * back to the file, so the panel asks it for the ones it wants to show and redraws when the answer comes.
 */
function mapSitesThrough(endpoint: string) {
  setSiteMapper(async (positions: Position[]) => {
    const response = await fetch(`${endpoint}/map`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', [CLIENT_HEADER]: '1' },
      body: JSON.stringify({ positions }),
    });
    if (!response.ok) throw new Error(`map: ${response.status}`);
    return ((await response.json()) as { sites?: Record<string, string> }).sites ?? {};
  });
}

/**
 * `?rpr=rec` records from the page's first commit. The engine boots before React, so it waits for a root to
 * appear; a cascade on mount is otherwise impossible to catch by hand.
 */
function recordFromLoad(engine: Engine, pending: RecordOnLoad | null, panel: Panel | null) {
  const deadline = Date.now() + 15_000;
  const tick = () => {
    if (engine.recording) return;
    try {
      engine.start({
        source: 'load',
        label: pending?.label || 'from page load',
        scope: pending?.names ? { names: pending.names } : null,
        ...(pending?.watch?.length ? { watch: pending.watch } : {}),
        // `?rpr=rec` is how a script asks, and a script is measuring: outlines cost frame time. The panel's own
        // load button comes through `pending` and keeps whatever the person set.
        ...(pending ? {} : { highlight: false }),
      });
      if (pending?.replay) void replayThenStop(engine, pending.replay, panel);
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

/** The panel's Repeat: the reloaded page does the steps again, then the recording stops and the report opens. */
async function replayThenStop(engine: Engine, plan: ReplayPlan, panel: Panel | null) {
  let failed: string | null = null;
  try {
    await replay(plan, { cancelled: () => !engine.recording, onStep: (at, of) => panel?.replayProgress(at, of) });
  } catch (error) {
    failed = error instanceof ReplayError ? `Replay stopped at ${error.message}` : String((error as Error)?.message ?? error);
  }
  panel?.replayProgress(null);
  if (!engine.recording) return;
  if (panel) await panel.finish(failed);
  else await engine.stop();
}

/** Called by the virtual entry the Vite plugin injects at the top of <head>: runs before the app's modules. */
export function boot(config: ClientConfig, plugins: PluginEntry[], hot?: HotContext): RecorderGlobal {
  const existing = window[GLOBAL_KEY];
  if (existing) return existing;
  captureRenderers();
  if (config.endpoint) mapSitesThrough(config.endpoint);
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
    onSitesMapped(() => panel?.redraw());
  }
  const pending = takeRecordOnLoad();
  if (pending || new URLSearchParams(location.search).get('rpr') === 'rec') recordFromLoad(engine, pending, panel);
  hot?.on('vite:beforeUpdate', (payload: { updates?: Array<{ path: string }> }) =>
    engine.noteHmr(
      'update',
      (payload?.updates ?? []).map((u) => u.path)
    )
  );
  hot?.on('vite:beforeFullReload', () => engine.interrupt());
  window.addEventListener('pagehide', () => engine.interrupt());
  const api: RecorderGlobal = {
    version: config.version,
    engine,
    panel,
    format,
    replay: (plan) => replay(plan, { cancelled: () => !engine.recording }),
  };
  window[GLOBAL_KEY] = api;
  return api;
}

export type { BootConfig } from '../core/engine';

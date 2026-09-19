import type { RecordingV1, SessionEvent } from '../shared/schema';
import { hookOwner, RecorderError } from './commit-hook';
import { compositeChain, fiberFromNode, findRoots, isProvider, nameOf, reactVersion, sourceOf, type Fiber } from './fiber';
import type { PluginHost } from './plugins';
import { Recorder, type EngineConfig, type HighlightSink, type RecordOptions } from './recorder';
import { scopeFromFiber, type ScopeHandle } from './scope';
import { SessionWriter, type SavedSession } from './transport';

export interface BootConfig extends EngineConfig {
  /** `{base}__react-perf-recorder`; null when no dev server stores sessions. */
  endpoint: string | null;
}

export type ScopeSpec = ScopeHandle | { selector: string; component?: string; level?: number } | { names: string[] } | null;

export interface StartOptions extends Omit<RecordOptions, 'scope'> {
  scope?: ScopeSpec;
  /** Stream the session to the dev server; on by default when there is one. */
  save?: boolean;
}

export interface Owner {
  name: string;
  source: string;
  wrapper: boolean;
  fiber: Fiber;
}

export interface Saved extends RecordingV1 {
  id?: string;
  dir?: string;
  saveError?: string;
}

/** The page-side API: `window.__REACT_PERF_RECORDER__.engine`. */
export class Engine {
  last: Saved | null = null;
  private recorder: Recorder | null = null;
  private writer: SessionWriter | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private listeners = new Set<(state: 'started' | 'stopped') => void>();
  private readonly wrapperRe: RegExp;

  constructor(
    readonly config: BootConfig,
    readonly plugins: PluginHost,
    private highlight: HighlightSink | null = null,
    private ownHost: Element | null = null
  ) {
    this.wrapperRe = new RegExp(config.wrapperPattern || '^$');
  }

  /** The panel and its highlight canvas: events inside the panel are not user actions. */
  attachUi(highlight: HighlightSink | null, ownHost: Element | null) {
    this.highlight = highlight;
    this.ownHost = ownHost;
  }

  get version() {
    return this.config.version;
  }

  get recording() {
    return Boolean(this.recorder);
  }

  onChange(listener: (state: 'started' | 'stopped') => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  status() {
    const roots = findRoots();
    const busy = roots.map((root) => hookOwner(root)).find(Boolean) ?? null;
    return {
      version: this.version,
      recording: this.recording,
      busyOwner: this.recording ? null : busy,
      react: { found: roots.length > 0, version: reactVersion(), roots: roots.length },
      scope: this.recorder?.scopeInfo ?? null,
      sessionId: this.writer?.id ?? null,
      plugins: this.plugins.info(),
    };
  }

  start(options: StartOptions = {}) {
    if (this.recorder) throw new RecorderError('ALREADY', 'a recording is already running');
    const scope = this.resolveScope(options.scope ?? null);
    const writerRef: { current: SessionWriter | null } = { current: null };
    const recorder = new Recorder(
      {
        config: this.config,
        plugins: this.plugins,
        ownHost: this.ownHost,
        highlight: options.highlight === false ? null : this.highlight,
        onEvent: (event: SessionEvent) => writerRef.current?.push(event),
      },
      { ...options, scope }
    );
    recorder.start();
    this.recorder = recorder;
    if (this.config.endpoint && options.save !== false) {
      writerRef.current = this.writer = new SessionWriter(this.config.endpoint, {
        source: options.source ?? 'api',
        label: options.label,
        page: {
          url: location.href,
          title: document.title,
          viewport: `${innerWidth}×${innerHeight}`,
          dpr: devicePixelRatio,
          userAgent: navigator.userAgent,
        },
        scope: recorder.scopeInfo,
        conditions: recorder.startConditions,
        plugins: this.plugins.info(),
      });
    }
    this.timer = setTimeout(() => void this.stop(), this.config.maxDurationMs);
    this.listeners.forEach((l) => l('started'));
    return { scope: recorder.scopeInfo };
  }

  /** Stops, builds the recording and, with a dev server, saves it; resolves with the id of the saved session. */
  async stop(): Promise<Saved> {
    const recorder = this.recorder;
    if (!recorder) throw new RecorderError('NOT_RECORDING', 'no recording is running');
    if (this.timer) clearTimeout(this.timer);
    this.recorder = null;
    const writer = this.writer;
    this.writer = null;
    let recording: Saved;
    try {
      recording = recorder.stop();
    } finally {
      this.listeners.forEach((l) => l('stopped'));
    }
    if (writer) {
      const saved: SavedSession | null = await writer.finish(recording);
      if (saved) Object.assign(recording, { id: saved.id, dir: saved.dir });
      else recording.saveError = writer.failed ?? 'not saved';
    }
    this.last = recording;
    return recording;
  }

  async record(durationMs: number, options: StartOptions = {}): Promise<Saved> {
    this.start(options);
    await new Promise((resolve) => setTimeout(resolve, durationMs));
    return this.stop();
  }

  live() {
    return this.recorder?.live() ?? null;
  }

  noteHmr(type: string, paths: string[]) {
    this.recorder?.noteHmr(type, paths);
  }

  /** The page unloads mid-recording: flush what is left; the server marks the session interrupted. */
  interrupt() {
    if (!this.recorder) return;
    this.writer?.beacon(Math.round(this.recorder.now()));
  }

  /** Composite ancestors of an element, nearest first. */
  owners(el: Element): Owner[] {
    const host = fiberFromNode(el);
    if (!host) return [];
    return compositeChain(host)
      .reverse()
      .map((fiber) => {
        const name = nameOf(fiber) ?? 'Anonymous';
        return { name, source: sourceOf(fiber, this.config.projectRoot), wrapper: this.wrapperRe.test(name) || isProvider(name), fiber };
      });
  }

  scopeFromFiber(fiber: Fiber): ScopeHandle {
    return scopeFromFiber(fiber, this.config.projectRoot);
  }

  scopeFromElement(el: Element, level = 0): ScopeHandle {
    const owners = this.owners(el).filter((o) => !o.wrapper);
    const owner = owners[Math.min(level, owners.length - 1)];
    if (!owner) throw new RecorderError('SCOPE_NOT_FOUND', 'no React component owns this element');
    return this.scopeFromFiber(owner.fiber);
  }

  /** Finds the component again after a reload by its composite path, e.g. ['OrdersPanel', 'PositionTable']. */
  scopeFromNames(names: string[]): ScopeHandle {
    const target = names.at(-1);
    for (const root of findRoots()) {
      const stack: Fiber[] = [root.current];
      while (stack.length) {
        const f = stack.pop()!;
        if (target && nameOf(f) === target) {
          const chain = compositeChain(f)
            .map((x) => nameOf(x))
            .filter((n): n is string => Boolean(n));
          let i = names.length - 1;
          for (let j = chain.length - 1; j >= 0 && i >= 0; j--) if (chain[j] === names[i]) i--;
          if (i < 0) return this.scopeFromFiber(f);
        }
        if (f.sibling) stack.push(f.sibling);
        if (f.child) stack.push(f.child);
      }
    }
    throw new RecorderError('SCOPE_NOT_FOUND', `component ${names.join(' > ')} is not mounted`);
  }

  private resolveScope(spec: ScopeSpec): ScopeHandle | null {
    if (!spec) return null;
    if ('kind' in spec) return spec;
    if ('names' in spec) return this.scopeFromNames(spec.names);
    const el = document.querySelector(spec.selector);
    if (!el) throw new RecorderError('SCOPE_NOT_FOUND', `no element matches ${spec.selector}`);
    if (spec.component) {
      const owner = this.owners(el).find((o) => o.name === spec.component);
      if (!owner) throw new RecorderError('SCOPE_NOT_FOUND', `${spec.component} does not own ${spec.selector}`);
      return this.scopeFromFiber(owner.fiber);
    }
    return this.scopeFromElement(el, spec.level ?? 0);
  }
}

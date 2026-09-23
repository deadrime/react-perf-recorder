import type { RecordingV2, SessionEvent } from '../shared/schema';
import { safeUrl } from '../shared/url';
import { hookOwner, RecorderError } from './commit-hook';
import {
  compositeChain,
  compositeChildren,
  currentOf,
  isComposite,
  isLibraryFiber,
  fiberFromNode,
  findRoots,
  isProvider,
  nameOf,
  wrapsProvider,
  reactVersion,
  sourceOf,
  type Fiber,
} from './fiber';
import { LiveHighlight } from './live-highlight';
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

/** What the tree may hide: components of packages, providers, and the app's own unnamed wrappers. */
export interface Shown {
  library: boolean;
  providers: boolean;
}

export interface Owner {
  name: string;
  source: string;
  /** An unnamed component the app left for the pattern to name: `Anonymous`, `Memo`, `ForwardRef`. */
  wrapper: boolean;
  /** Hands a context down and nothing else. */
  provider: boolean;
  /** A component of a package, not of the app: no site of its own, or a file under node_modules. */
  library: boolean;
  fiber: Fiber;
}

export interface Saved extends RecordingV2 {
  id?: string;
  dir?: string;
  saveError?: string;
}

function applySites(recording: RecordingV2, sites: Record<string, { site: string; code?: string }>) {
  // The dev server has answered everything it could; a built position that stayed unmapped is an absolute URL of a
  // pre-bundled dependency, the longest string in the recording and of no use to anyone reading it.
  for (const action of recording.actions ?? []) {
    const own = action.target?.generatedSource;
    if (!own) continue;
    const mapped = sites[`${own.url}:${own.line}:${own.column}`];
    if (mapped) action.target!.source = mapped.site;
    delete action.target!.generatedSource;
  }
  for (const root of [...recording.roots, ...recording.outsideRoots]) {
    const own = root.generatedSource;
    if (own) {
      const ownMapped = sites[`${own.url}:${own.line}:${own.column}`];
      if (ownMapped) root.source = ownMapped.site;
      delete root.generatedSource;
    }
    for (const hook of Object.values(root.hooks ?? {})) {
      const g = hook.generated;
      if (!g) continue;
      const mapped = sites[`${g.url}:${g.line}:${g.column}`];
      if (mapped) {
        hook.site = mapped.site;
        if (mapped.code) hook.code = mapped.code;
      }
      delete hook.generated;
    }
  }
}

/** The page-side API: `window.__REACT_PERF_RECORDER__.engine`. */
export class Engine {
  last: Saved | null = null;
  private recorder: Recorder | null = null;
  /** The area the running recording was started with, as it was found: a load recording finds it before the panel does. */
  private recordingScope: ScopeHandle | null = null;
  private writer: SessionWriter | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  /** `saved`: a recording that stopped on its own at the length limit, once it is saved — no one else asked for it. */
  private listeners = new Set<(state: 'started' | 'stopped' | 'saved', saved?: Saved) => void>();
  /** The stop the length limit made, for whoever was waiting to stop it themselves. */
  private autoStop: Promise<Saved> | null = null;
  private readonly wrapperRe: RegExp;
  private idle: { scope: ScopeSpec } | null = null;
  private idleHighlight: LiveHighlight | null = null;
  private idleRetry: ReturnType<typeof setTimeout> | null = null;

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

  get scopeOfRecording(): ScopeHandle | null {
    return this.recordingScope;
  }

  onChange(listener: (state: 'started' | 'stopped' | 'saved', saved?: Saved) => void) {
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

  /**
   * Outlines renders in the area while nothing is recorded. A recording takes the commit hook over and, with
   * `highlight` on, keeps drawing; this resumes after it stops.
   */
  highlightWhenIdle(on: boolean, scope: ScopeSpec = null) {
    this.idle = on ? { scope } : null;
    this.syncIdleHighlight();
  }

  get idleHighlighting() {
    return Boolean(this.idleHighlight);
  }

  private syncIdleHighlight() {
    this.idleHighlight?.stop();
    this.idleHighlight = null;
    if (this.idleRetry) clearTimeout(this.idleRetry);
    this.idleRetry = null;
    if (!this.idle || this.recorder || !this.highlight) return;
    try {
      const live = new LiveHighlight(this.highlight, this.resolveScope(this.idle.scope));
      if (live.start()) this.idleHighlight = live;
    } catch {
      // Handled below: the area is not mounted yet.
    }
    // The panel boots before the app renders, and another script may hold the commit hook for a while.
    if (!this.idleHighlight) this.idleRetry = setTimeout(() => this.syncIdleHighlight(), 1000);
  }

  start(options: StartOptions = {}) {
    if (this.recorder) throw new RecorderError('ALREADY', 'a recording is already running');
    const scope = this.resolveScope(options.scope ?? null);
    this.idleHighlight?.stop();
    this.idleHighlight = null;
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
    try {
      recorder.start();
    } catch (error) {
      this.syncIdleHighlight();
      throw error;
    }
    this.recorder = recorder;
    this.recordingScope = scope;
    if (this.config.endpoint && options.save !== false) {
      writerRef.current = this.writer = new SessionWriter(this.config.endpoint, {
        source: options.source ?? 'api',
        label: options.label,
        page: {
          url: safeUrl(location.href),
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
    this.autoStop = null;
    this.timer = setTimeout(() => {
      const stop = (this.autoStop = this.stop());
      stop.then((saved) => this.listeners.forEach((l) => l('saved', saved))).catch(() => {});
    }, this.config.maxDurationMs);
    this.listeners.forEach((l) => l('started'));
    return { scope: recorder.scopeInfo };
  }

  /** Stops, builds the recording and, with a dev server, saves it; resolves with the id of the saved session. */
  async stop(): Promise<Saved> {
    const recorder = this.recorder;
    if (!recorder) throw new RecorderError('NOT_RECORDING', 'no recording is running');
    if (this.timer) clearTimeout(this.timer);
    this.recorder = null;
    this.recordingScope = null;
    const writer = this.writer;
    this.writer = null;
    let recording: Saved;
    try {
      recording = recorder.stop();
    } finally {
      this.syncIdleHighlight();
      this.listeners.forEach((l) => l('stopped'));
    }
    if (writer) {
      const saved: SavedSession | null = await writer.finish(recording);
      if (saved) {
        Object.assign(recording, { id: saved.id, dir: saved.dir });
        applySites(recording, saved.sites ?? {});
      } else recording.saveError = writer.failed ?? 'not saved';
    }
    this.last = recording;
    return recording;
  }

  async record(durationMs: number, options: StartOptions = {}): Promise<Saved> {
    this.start(options);
    await new Promise((resolve) => setTimeout(resolve, durationMs));
    // Longer than the limit: the recording already stopped itself, and that stop is the answer.
    if (!this.recorder && this.autoStop) return this.autoStop;
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

  /**
   * The app's own components on the page right now, by name. A script that was told to record inside one and did
   * not find it can say what there is instead of failing into nothing.
   */
  componentNames(limit = 60): string[] {
    const names = new Set<string>();
    for (const root of findRoots()) {
      const stack: Fiber[] = [root.current];
      while (stack.length && names.size < limit) {
        const f = stack.pop()!;
        const name = nameOf(f);
        if (name && !isLibraryFiber(f)) names.add(name);
        if (f.sibling) stack.push(f.sibling);
        if (f.child) stack.push(f.child);
      }
    }
    return [...names];
  }

  /**
   * Every instance of a component on the page now, found by its name and file. A line that moved since the
   * recording (the code was edited) still finds it by the file; failing that, by the name alone.
   */
  findComponents(name: string, source?: string, limit = 50): Fiber[] {
    const named: Fiber[] = [];
    for (const root of findRoots()) {
      const stack: Fiber[] = [root.current];
      while (stack.length && named.length < limit * 4) {
        const f = stack.pop()!;
        // `memo(Row, areEqual)` and `memo(forwardRef(Row))` are two fibers of one instance, both called Row.
        const inner = f.return !== null && isComposite(f.return) && nameOf(f.return) === name;
        if (nameOf(f) === name && isComposite(f) && !inner) named.push(f);
        if (f.sibling) stack.push(f.sibling);
        if (f.child) stack.push(f.child);
      }
    }
    if (!source) return named.slice(0, limit);
    const file = source.replace(/:\d+(:\d+)?$/, '');
    const same = named.filter((f) => sourceOf(f, this.config.projectRoot) === source);
    const sameFile = named.filter((f) => sourceOf(f, this.config.projectRoot).replace(/:\d+(:\d+)?$/, '') === file);
    return (same.length ? same : sameFile.length ? sameFile : named).slice(0, limit);
  }

  /**
   * The topmost of the app's own components, as the tree shows them with these filters: where a tree of the whole
   * app opens when no area has been picked yet.
   */
  topComponent(shown: Shown): Fiber | null {
    for (const root of findRoots()) {
      const [top] = compositeChildren(root.current, (f) => this.hidden(this.ownerOf(f), shown), 1);
      if (top) return top;
    }
    return null;
  }

  /** Composite ancestors of an element, nearest first. */
  owners(el: Element): Owner[] {
    const host = fiberFromNode(el);
    return host ? this.ownersOfFiber(host) : [];
  }

  /** The fiber itself when it is a component, then its composite ancestors, nearest first. */
  ownersOfFiber(fiber: Fiber): Owner[] {
    return compositeChain(currentOf(fiber))
      .reverse()
      .map((f) => this.ownerOf(f));
  }

  ownerOf(fiber: Fiber): Owner {
    const name = nameOf(fiber) ?? 'Anonymous';
    return {
      name,
      source: sourceOf(fiber, this.config.projectRoot),
      wrapper: this.wrapperRe.test(name),
      provider: isProvider(name) || wrapsProvider(fiber),
      library: isLibraryFiber(fiber),
      fiber,
    };
  }

  /** Nearest components below one; what is hidden is walked through, not stopped at. */
  childOwners(fiber: Fiber, shown: Shown): Owner[] {
    return compositeChildren(fiber, (f) => this.hidden(this.ownerOf(f), shown)).map((f) => this.ownerOf(f));
  }

  /** A component the tree leaves out: the checkboxes decide, and an unnamed wrapper follows the library one. */
  hidden(owner: Owner, shown: Shown): boolean {
    return (!shown.library && (owner.library || owner.wrapper)) || (!shown.providers && owner.provider);
  }

  scopeFromFiber(fiber: Fiber): ScopeHandle {
    return scopeFromFiber(fiber, this.config.projectRoot);
  }

  scopeFromElement(el: Element, level = 0): ScopeHandle {
    const owners = this.owners(el).filter((o) => !o.wrapper && !o.library && !o.provider);
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

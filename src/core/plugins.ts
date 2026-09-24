import type { CauseInput, DescribeKind, PluginContext, RuntimePlugin, RuntimePluginFactory, SessionContext } from '../runtime';
import type { Conditions, PluginInfo, PluginSection, Primitive } from '../shared/schema';
import type { Fiber } from './fiber';
import { fallbackSelectorLabel, type Describer } from './reasons';

export interface CauseEvent {
  plugin: string;
  type: string;
  atMs: number;
  changes?: Array<{ key: string; prev: unknown; next: unknown }>;
  data?: Record<string, Primitive>;
  /** Components the event scheduled updates on, when the core knows them: the cause goes to those roots only. */
  fibers?: Set<Fiber>;
  /** The event knows which components it woke — even if that turned out to be none of them. */
  aimed?: true;
}

interface Waiting extends CauseEvent {
  merge?: string;
  emittedAt: number;
}

/** A waiting event whose timer never came (a scheduler of the app's own) goes to the next commit as it is. */
const WAIT_MS = 1000;

export type PluginEntry = [RuntimePluginFactory | RuntimePlugin, unknown];

interface Loaded {
  plugin: RuntimePlugin;
  error?: string;
}

const MAX_BUFFER = 5000;

/** Runtime halves of the plugins: labels, cause events and their sections of the recording. */
export class PluginHost implements Describer {
  readonly loaded: Loaded[] = [];
  recording = false;
  /** Set by the recorder: components that got updates since the last commit, to aim a cause at their roots. */
  targets: (() => Set<Fiber>) | null = null;
  private buffer: CauseEvent[] = [];
  /** `waitForTimer` events, until a timer of their plugin's packages runs. */
  private waiting: Waiting[] = [];
  private readonly owners = new Map<string, string>();
  private t0 = 0;
  readonly warnings: string[] = [];

  constructor(entries: PluginEntry[]) {
    for (const [factoryOrPlugin, options] of entries) {
      try {
        const plugin = typeof factoryOrPlugin === 'function' ? factoryOrPlugin(options) : factoryOrPlugin;
        if (!plugin?.name) throw new Error('plugin without a name');
        this.loaded.push({ plugin });
        for (const name of plugin.packages ?? []) this.owners.set(name, plugin.name);
      } catch (error) {
        this.loaded.push({ plugin: { name: `plugin#${this.loaded.length}` }, error: String((error as Error)?.message ?? error) });
      }
    }
  }

  setupAll() {
    for (const entry of this.loaded) {
      if (entry.error || !entry.plugin.setup) continue;
      this.guard(entry, () => entry.plugin.setup!(this.context(entry.plugin.name)));
    }
  }

  info(): PluginInfo[] {
    return this.loaded.map(({ plugin, error }) => ({ name: plugin.name, sectionVersion: plugin.sectionVersion ?? 1, ...(error ? { error } : {}) }));
  }

  context(name: string): PluginContext {
    const host = this;
    return {
      get recording() {
        return host.recording;
      },
      emitCause: (event: CauseInput) => host.emit(name, event),
      now: () => host.now(),
      warn: (message: string) => host.warnings.push(`${name}: ${message}`),
    };
  }

  /** Aimed only when the caller says it can be: an event that runs before React cannot say whom it woke. */
  emit(plugin: string, event: CauseInput, fibers?: Set<Fiber>): CauseEvent | null {
    if (!this.recording || this.buffer.length >= MAX_BUFFER) return null;
    if (event.waitForTimer && this.waiting.length < MAX_BUFFER) {
      const same = event.merge ? this.waiting.find((w) => w.plugin === plugin && w.merge === event.merge) : undefined;
      if (same) {
        same.type = event.type;
        return same;
      }
      const cause: Waiting = {
        plugin,
        type: event.type,
        atMs: Math.round(this.now()),
        changes: event.changes,
        data: event.data,
        merge: event.merge,
        emittedAt: performance.now(),
      };
      this.waiting.push(cause);
      return cause;
    }
    const aimed = fibers ?? (event.aim ? this.targets?.() : undefined);
    const cause: CauseEvent = {
      plugin,
      type: event.type,
      atMs: Math.round(this.now()),
      changes: event.changes,
      data: event.data,
      ...(aimed ? { aimed: true as const } : {}),
      fibers: aimed?.size ? aimed : undefined,
    };
    this.buffer.push(cause);
    return cause;
  }

  get hasWaiting() {
    return this.waiting.length > 0;
  }

  /**
   * A timer of `library` ran: the events its plugin had waiting since before it started go to the components it
   * updated — `null` when the commit ran inside the timer and they cannot be told — or nowhere if it updated none.
   * Returns whether the timer was a plugin's delivery, which then needs no cause of its own.
   */
  deliver(library: string | null, fibers: () => Set<Fiber> | null, startedAt = Infinity): boolean {
    const plugin = library ? this.owners.get(library) : undefined;
    if (!plugin) return false;
    const mine = this.waiting.filter((w) => w.plugin === plugin && w.emittedAt < startedAt);
    if (!mine.length) return false;
    this.waiting = this.waiting.filter((w) => !mine.includes(w));
    const aimed = fibers();
    for (const { merge, emittedAt, ...cause } of mine) {
      if (!aimed) this.buffer.push(cause);
      else if (aimed.size) this.buffer.push({ ...cause, aimed: true, fibers: aimed });
    }
    return true;
  }

  drain(): CauseEvent[] {
    if (this.waiting.length && performance.now() - this.waiting[0].emittedAt > WAIT_MS) {
      const cutoff = performance.now() - WAIT_MS;
      for (const { merge, emittedAt, ...cause } of this.waiting.filter((w) => w.emittedAt <= cutoff)) this.buffer.push(cause);
      this.waiting = this.waiting.filter((w) => w.emittedAt > cutoff);
    }
    if (!this.buffer.length) return this.buffer;
    const out = this.buffer;
    this.buffer = [];
    return out;
  }

  now() {
    return performance.now() - this.t0;
  }

  selector(fn: Function, depth = 0): string {
    if (depth > 3) return fallbackSelectorLabel(fn);
    return this.describe(fn, 'selector', depth) ?? fallbackSelectorLabel(fn);
  }

  store(getSnapshot: Function): string | null {
    return this.describe(getSnapshot, 'store', 0);
  }

  private describe(fn: Function, kind: DescribeKind, depth: number): string | null {
    for (const entry of this.loaded) {
      if (entry.error || !entry.plugin.describe) continue;
      try {
        const label = entry.plugin.describe(fn, kind, (inner) => this.selector(inner, depth + 1));
        if (label != null) return label;
      } catch {
        // A plugin that fails to label must not break the reason.
      }
    }
    return null;
  }

  start(session: Omit<SessionContext, keyof PluginContext>, t0: number) {
    this.t0 = t0;
    this.buffer = [];
    this.waiting = [];
    this.recording = true;
    for (const entry of this.loaded) {
      if (entry.error || !entry.plugin.start) continue;
      this.guard(entry, () => entry.plugin.start!({ ...this.context(entry.plugin.name), ...session }));
    }
  }

  commit(session: Omit<SessionContext, keyof PluginContext>) {
    for (const entry of this.loaded) {
      if (entry.error || !entry.plugin.commit) continue;
      this.guard(entry, () => entry.plugin.commit!({ ...this.context(entry.plugin.name), ...session }));
    }
  }

  stop(session: Omit<SessionContext, keyof PluginContext>): Record<string, PluginSection> {
    this.recording = false;
    this.buffer = [];
    this.waiting = [];
    const sections: Record<string, PluginSection> = {};
    for (const entry of this.loaded) {
      if (entry.error || !entry.plugin.stop) continue;
      this.guard(entry, () => {
        const section = entry.plugin.stop!({ ...this.context(entry.plugin.name), ...session });
        if (section) sections[entry.plugin.name] = section;
      });
    }
    return sections;
  }

  conditions(): Conditions {
    const out: Conditions = {};
    for (const entry of this.loaded) {
      if (entry.error || !entry.plugin.conditions) continue;
      this.guard(entry, () => Object.assign(out, entry.plugin.conditions!()));
    }
    return out;
  }

  private guard(entry: Loaded, fn: () => void) {
    try {
      fn();
    } catch (error) {
      this.warnings.push(`${entry.plugin.name}: ${String((error as Error)?.message ?? error).slice(0, 200)}`);
    }
  }
}

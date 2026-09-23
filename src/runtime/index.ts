import type { Conditions, JsonValue, PluginSection, Primitive } from '../shared/schema';
import type { Fiber } from '../core/fiber';

export type { Conditions, JsonValue, PluginSection, Primitive } from '../shared/schema';
export type { Fiber } from '../core/fiber';
export { createMemoInstrumentation, type MemoInstrumentation, type MemoStat } from './memo';
export { noteRoot } from '../core/roots-notify';

export interface CauseInput {
  /** Shown as `<plugin>:<type>`, e.g. `markets/updateMarketsAmmState`. */
  type: string;
  /** Top-level keys the event changed; the core marks the ones with the same content and drops the values. */
  changes?: Array<{ key: string; prev: unknown; next: unknown }>;
  data?: Record<string, Primitive>;
  /**
   * Emitted after React was told of the update, so the recorder can see which components it woke.
   * Leave it out when the event runs ahead of React, as a query cache or a navigation does.
   */
  aim?: true;
}

export interface PluginContext {
  readonly recording: boolean;
  /** Queues a cause for the next commit and returns it, so a later hook can refine `type`; null outside a recording. */
  emitCause(event: CauseInput): { type: string } | null;
  /** Milliseconds since the recording started. */
  now(): number;
  warn(message: string): void;
}

export interface SessionContext extends PluginContext {
  scope: { name: string; source: string } | null;
  /** One full walk of the committed tree; use for discovery at start, not per commit. */
  findFibers(predicate: (fiber: Fiber) => boolean, limit?: number): Fiber[];
}

export type DescribeKind = 'selector' | 'store';

export interface RuntimePlugin<Data = unknown> {
  name: string;
  sectionVersion?: number;
  /** Runs at page boot, before the app's modules. */
  setup?(ctx: PluginContext): void;
  /** Label for a store selector or a store (by its getSnapshot); `null` when the function is not the plugin's. */
  describe?(fn: Function, kind: DescribeKind, next: (fn: Function) => string): string | null;
  start?(session: SessionContext): void;
  stop?(session: SessionContext): PluginSection<Data> | void;
  conditions?(): Conditions;
}

export type RuntimePluginFactory<Options = any> = (options: Options) => RuntimePlugin;

/** Identity helper for typing; the module's default export is the factory. */
export const definePlugin = <Options = void>(factory: (options: Options) => RuntimePlugin): RuntimePluginFactory<Options> => factory;

export type { JsonValue as PluginOptions };

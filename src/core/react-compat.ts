import { libraryOf, parseStack, type Frame } from './stack';
import type { Fiber } from './fiber';

/**
 * Everything that differs between React majors lives here. The fiber's own fields tell which way React answers;
 * the version decides only the lane bits, because those moved rather than disappeared.
 */

export interface Site {
  /** React 18: the file the JSX was written in. React 19: the module the dev server served, at its built position. */
  url: string;
  line: number;
  column: number;
  /** React 18 hands over the original position; React 19's has to go through a source map before anyone reads it. */
  exact: boolean;
}

/** React's own marker for the frame under which nothing is the app's code any more. */
const BOTTOM_FRAME = /react_stack_bottom_frame/;

const ownerStackSites = new WeakMap<Error, Site | null>();
const ownerStackFrames = new WeakMap<Error, Frame[]>();
let sawSite = false;
let sawFiberWithoutSite = false;

/** Where the element of a fiber was written: `_debugSource` on React 18, the owner stack's second frame on 19.1+. */
export function siteOf(f: Fiber): Site | null {
  const legacy = f._debugSource;
  if (legacy?.fileName) {
    sawSite = true;
    return { url: legacy.fileName, line: legacy.lineNumber, column: legacy.columnNumber ?? 0, exact: true };
  }
  const stack = f._debugStack;
  if (stack instanceof Error) {
    const site = ownerStackSite(stack);
    if (site) sawSite = true;
    else sawFiberWithoutSite = true;
    return site;
  }
  sawFiberWithoutSite = true;
  return null;
}

/** `prepareStackTrace` is turned off so no other tool reformats the stack; the first read costs, so it is kept. */
function framesOf(error: Error): Frame[] {
  const cached = ownerStackFrames.get(error);
  if (cached) return cached;
  const holder = Error as ErrorConstructor & { prepareStackTrace?: unknown };
  const previous = holder.prepareStackTrace;
  let text = '';
  try {
    holder.prepareStackTrace = undefined;
    text = error.stack ?? '';
  } catch {
    text = '';
  } finally {
    holder.prepareStackTrace = previous;
  }
  const frames = parseStack(text);
  ownerStackFrames.set(error, frames);
  return frames;
}

function ownerStackSite(error: Error): Site | null {
  const known = ownerStackSites.get(error);
  if (known !== undefined) return known;
  const frames = framesOf(error);
  // frames[0] is `jsxDEV` or `createElement` itself: the element was written one frame below it.
  const frame = frames[1];
  const site = frame && !BOTTOM_FRAME.test(frame.fn) ? { url: frame.url, line: frame.line, column: frame.column, exact: false } : null;
  ownerStackSites.set(error, site);
  return site;
}

/**
 * The site to show for a fiber: an element a package wrote — `flexRender` of a table, a Radix trigger — is shown at
 * the app's line that handed it over, the first app frame below in the owner stack. Whether a component is a
 * package's still reads the element's own site.
 */
export function shownSiteOf(f: Fiber): Site | null {
  const site = siteOf(f);
  const stack = f._debugStack;
  if (!site || site.exact || libraryOf(site.url) === null || !(stack instanceof Error)) return site;
  for (const frame of framesOf(stack).slice(2)) {
    if (BOTTOM_FRAME.test(frame.fn)) break;
    if (libraryOf(frame.url) === null) return { url: frame.url, line: frame.line, column: frame.column, exact: false };
  }
  return site;
}

/**
 * True when React tells nothing about where components come from — 19.0 dropped `_debugSource` before owner stacks
 * landed in 19.1 — so the recording says so instead of quietly reporting empty sources.
 */
export function sourcesUnavailable(): boolean {
  return sawFiberWithoutSite && !sawSite;
}

const ContextProviderTag = 10;
const ContextConsumerTag = 9;

export const isProviderTag = (tag: number) => tag === ContextProviderTag;
export const isConsumerTag = (tag: number) => tag === ContextConsumerTag;

/** React 18 hangs the context off the provider's type; React 19 made the context its own provider. */
export function contextOf(f: Fiber): { displayName?: string } | null {
  const type = f.type as { _context?: { displayName?: string } } | null | undefined;
  return (type?._context ?? type ?? null) as { displayName?: string } | null;
}

/** Hooks that take no cell of the hook list; `useMemoCache` lives on the fiber's update queue instead. */
const HOOKS_WITHOUT_CELLS = new Set(['useContext', 'useDebugValue', 'use', 'useMemoCache', 'useHostTransitionStatus', 'useFormStatus']);

/** The few that take more than one: the store hook plus its subscribing effect, and so on. */
const HOOK_CELLS: Record<string, number> = {
  useSyncExternalStore: 2,
  useTransition: 2,
  useActionState: 3,
  useFormState: 3,
};

/** How many cells of the hook list a primitive takes; one, unless React says otherwise. */
export const hookCells = (type: string): number => (HOOKS_WITHOUT_CELLS.has(type) ? 0 : HOOK_CELLS[type] ?? 1);

type LaneTable = Array<[number, string]>;

const LANES_18: LaneTable = [
  [0b1, 'Sync'],
  [0b10, 'InputContinuousHydration'],
  [0b100, 'InputContinuous'],
  [0b1000, 'DefaultHydration'],
  [0b10000, 'Default'],
  [0b100000, 'TransitionHydration'],
  [0b1111111111111111000000, 'Transition'],
  [0b11111 << 22, 'Retry'],
  [1 << 27, 'SelectiveHydration'],
  [1 << 28, 'IdleHydration'],
  [1 << 29, 'Idle'],
  [1 << 30, 'Offscreen'],
];

// React 19 put a hydration lane at the bottom, so every bit above it moved up one: Sync is 2 there, not 1.
const LANES_19: LaneTable = [
  [0b1, 'SyncHydration'],
  [0b10, 'Sync'],
  [0b100, 'InputContinuousHydration'],
  [0b1000, 'InputContinuous'],
  [0b10000, 'DefaultHydration'],
  [0b100000, 'Default'],
  [0b1000000, 'TransitionHydration'],
  [261888, 'Transition'],
  [3932160, 'TransitionDeferred'],
  [62914560, 'Retry'],
  [1 << 26, 'SelectiveHydration'],
  [1 << 27, 'IdleHydration'],
  [1 << 28, 'Idle'],
  [1 << 29, 'Offscreen'],
  [1 << 30, 'Deferred'],
];

/** Label of the highest-priority lane in the set; a bit this React added since is named by its number. */
export function laneLabel(lanes: number): string | undefined {
  if (!lanes) return undefined;
  const lowest = lanes & -lanes;
  for (const [mask, label] of majorVersion() >= 19 ? LANES_19 : LANES_18) if (lowest & mask) return label;
  return `lane:${lowest}`;
}

export interface Renderer {
  version?: string;
  currentDispatcherRef?: { current: unknown } | { H: unknown };
  getLaneLabelMap?: () => Map<number, string>;
}

type InjectFn = ((renderer: Renderer) => number) & { rprCaptured?: boolean };

interface DevtoolsHook {
  renderers?: Map<number, Renderer>;
  inject?: InjectFn;
}

const captured = new Set<Renderer>();

/**
 * Remembers every renderer React injects: the React Refresh hook counts injections without storing them in
 * `renderers`. Must run before react-dom loads.
 */
export function captureRenderers() {
  const target = globalThis as { __REACT_DEVTOOLS_GLOBAL_HOOK__?: DevtoolsHook & Record<string, unknown> };
  let hook = target.__REACT_DEVTOOLS_GLOBAL_HOOK__;
  if (!hook) {
    const renderers = new Map<number, Renderer>();
    const noop = () => {};
    hook = {
      renderers,
      supportsFiber: true,
      isDisabled: false,
      inject(renderer: Renderer) {
        const id = renderers.size + 1;
        renderers.set(id, renderer);
        return id;
      },
      onCommitFiberRoot: noop,
      onCommitFiberUnmount: noop,
      onPostCommitFiberRoot: noop,
      onScheduleFiberRoot: noop,
      checkDCE: noop,
      on: noop,
      off: noop,
      emit: noop,
      sub: () => noop,
    };
    target.__REACT_DEVTOOLS_GLOBAL_HOOK__ = hook;
  }
  for (const renderer of hook.renderers?.values() ?? []) captured.add(renderer);
  const original = hook.inject;
  if (typeof original === 'function' && !original.rprCaptured) {
    const inject: InjectFn = function (this: unknown, renderer: Renderer) {
      captured.add(renderer);
      return original.call(this, renderer);
    };
    inject.rprCaptured = true;
    hook.inject = inject;
  }
}

function knownRenderers(): Renderer[] {
  const hook = (globalThis as { __REACT_DEVTOOLS_GLOBAL_HOOK__?: DevtoolsHook }).__REACT_DEVTOOLS_GLOBAL_HOOK__;
  return [...captured, ...(hook?.renderers?.values() ?? [])];
}

export function reactVersion(): string | null {
  return knownRenderers().find((r) => r.version)?.version ?? null;
}

export function renderer(): Renderer | null {
  return knownRenderers().find((r) => r.currentDispatcherRef) ?? null;
}

function majorVersion(): number {
  return Number.parseInt(reactVersion() ?? '', 10) || 0;
}

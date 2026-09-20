import type { Fiber, FiberRoot } from './fiber';

export class RecorderError extends Error {
  constructor(public code: 'BUSY' | 'NO_ROOT' | 'ALREADY' | 'SCOPE_NOT_FOUND' | 'NOT_RECORDING', message: string, public owner?: string) {
    super(message);
    this.name = 'RecorderError';
  }
}

type OwnedSetter = ((fiber: Fiber) => void) & { owner?: string };

export interface CommitInfo {
  root: FiberRoot;
  fiber: Fiber;
  /** Lanes of the commit; React clears `root.finishedLanes` before assigning `root.current`. */
  lanes: number;
}

export interface CommitHook {
  stop(): string[];
  overhead: { commitMs: number; maxCommitMs: number };
}

export function hookOwner(root: FiberRoot): string | null {
  const setter = Object.getOwnPropertyDescriptor(root, 'current')?.set as OwnedSetter | undefined;
  if (!setter) return null;
  return setter.owner ?? 'unknown script';
}

/**
 * Catches every commit through a setter on `root.current`: React 18 assigns it exactly once per commit, after the
 * mutation phase and before layout effects. The DevTools hook is not used: react-grab's bippy owns it, and polling
 * `root.current` once per frame loses commits because current and alternate swap.
 */
export function hookCommits(
  roots: FiberRoot[],
  owner: string,
  onCommit: (info: CommitInfo) => void,
  /** Called the moment React marks new work on a root, while the code that scheduled it is still on the stack. */
  onUpdate?: () => void
): CommitHook {
  for (const root of roots) {
    const busy = hookOwner(root);
    if (busy) throw new RecorderError('BUSY', `root.current is already hooked by ${busy}: wait for it to finish or call its stop()`, busy);
  }
  const errors: string[] = [];
  const overhead = { commitMs: 0, maxCommitMs: 0 };
  const restores = roots.map((root) => {
    let current = root.current;
    let lanes = 0;
    let passthrough = false;
    const set: OwnedSetter = (fiber) => {
      current = fiber;
      if (passthrough) return;
      const started = performance.now();
      try {
        onCommit({ root, fiber, lanes });
      } catch (error) {
        if (errors.length < 3) errors.push(String((error as Error)?.stack || error).slice(0, 300));
      }
      const ms = performance.now() - started;
      overhead.commitMs += ms;
      overhead.maxCommitMs = Math.max(overhead.maxCommitMs, ms);
    };
    set.owner = `react-perf-recorder:${owner}`;
    Object.defineProperty(root, 'current', { configurable: true, enumerable: true, get: () => current, set });

    const pendingDescriptor = Object.getOwnPropertyDescriptor(root, 'pendingLanes');
    let pendingLanes = root.pendingLanes ?? 0;
    const hasPending = Boolean(onUpdate) && pendingDescriptor && 'value' in pendingDescriptor && pendingDescriptor.configurable;
    if (hasPending) {
      Object.defineProperty(root, 'pendingLanes', {
        configurable: true,
        enumerable: true,
        get: () => pendingLanes,
        set: (value: number) => {
          const added = value & ~pendingLanes;
          pendingLanes = value;
          if (!added || passthrough) return;
          try {
            onUpdate!();
          } catch (error) {
            if (errors.length < 3) errors.push(String((error as Error)?.stack || error).slice(0, 300));
          }
        },
      });
    }

    const lanesDescriptor = Object.getOwnPropertyDescriptor(root, 'finishedLanes');
    let finishedLanes = root.finishedLanes ?? 0;
    const hasLanes = lanesDescriptor && 'value' in lanesDescriptor && lanesDescriptor.configurable;
    if (hasLanes) {
      Object.defineProperty(root, 'finishedLanes', {
        configurable: true,
        enumerable: true,
        get: () => finishedLanes,
        set: (value: number) => {
          finishedLanes = value;
          if (value) lanes = value;
        },
      });
    }

    return () => {
      // Someone may have wrapped our accessor since; then only stop reacting and leave theirs in place.
      if (Object.getOwnPropertyDescriptor(root, 'current')?.set === set) {
        Object.defineProperty(root, 'current', { configurable: true, enumerable: true, writable: true, value: current });
      } else {
        passthrough = true;
      }
      if (hasLanes) Object.defineProperty(root, 'finishedLanes', { configurable: true, enumerable: true, writable: true, value: finishedLanes });
      if (hasPending) Object.defineProperty(root, 'pendingLanes', { configurable: true, enumerable: true, writable: true, value: pendingLanes });
    };
  });
  let active = true;
  return {
    overhead,
    stop() {
      if (active) restores.forEach((restore) => restore());
      active = false;
      return errors;
    },
  };
}

const LANE_LABELS: Array<[number, string]> = [
  [0b1, 'Sync'],
  [0b10, 'InputContinuousHydration'],
  [0b100, 'InputContinuous'],
  [0b1000, 'DefaultHydration'],
  [0b10000, 'Default'],
  [0b100000, 'TransitionHydration'],
  [0b1111111111111111000000, 'Transition'],
  [0b1111100000000000000000000000, 'Retry'],
  [0b1 << 27, 'SelectiveHydration'],
  [0b1 << 28, 'IdleHydration'],
  [0b1 << 29, 'Idle'],
  [0b1 << 30, 'Offscreen'],
];

/** Label of the highest-priority lane in the set; React 18 bit layout. */
export function laneLabel(lanes: number): string | undefined {
  if (!lanes) return undefined;
  const lowest = lanes & -lanes;
  for (const [mask, label] of LANE_LABELS) if (lowest & mask) return label;
  return `lane:${lowest}`;
}

import type { Fiber, FiberRoot } from './fiber';

export { laneLabel } from './react-compat';

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
  /** Lanes of the commit: the bits React took back off `root.pendingLanes` on its way into this commit. */
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
 * Catches every commit through a setter on `root.current`, which React assigns once per commit before layout
 * effects. Not the DevTools hook: react-grab's bippy owns it.
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
      const taken = lanes;
      lanes = 0;
      if (passthrough) return;
      const started = performance.now();
      try {
        onCommit({ root, fiber, lanes: taken });
      } catch (error) {
        if (errors.length < 3) errors.push(String((error as Error)?.stack || error).slice(0, 300));
      }
      const ms = performance.now() - started;
      overhead.commitMs += ms;
      overhead.maxCommitMs = Math.max(overhead.maxCommitMs, ms);
    };
    set.owner = `react-perf-recorder:${owner}`;
    Object.defineProperty(root, 'current', { configurable: true, enumerable: true, get: () => current, set });

    // A commit's lanes are the bits `markRootFinished` cleared from `pendingLanes` since the last one; React 19.1+
    // has no `finishedLanes` on the root to read instead.
    const pendingDescriptor = Object.getOwnPropertyDescriptor(root, 'pendingLanes');
    let pendingLanes = root.pendingLanes ?? 0;
    const hasPending = pendingDescriptor && 'value' in pendingDescriptor && pendingDescriptor.configurable;
    if (hasPending) {
      Object.defineProperty(root, 'pendingLanes', {
        configurable: true,
        enumerable: true,
        get: () => pendingLanes,
        set: (value: number) => {
          const added = value & ~pendingLanes;
          lanes |= pendingLanes & ~value;
          pendingLanes = value;
          if (!added || passthrough || !onUpdate) return;
          try {
            onUpdate();
          } catch (error) {
            if (errors.length < 3) errors.push(String((error as Error)?.stack || error).slice(0, 300));
          }
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

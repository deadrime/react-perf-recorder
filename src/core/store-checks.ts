import { hasHooks, type Fiber } from './fiber';

/** What React keeps for a `useSyncExternalStore` hook: the snapshot it rendered and how to read the store again. */
interface StoreInst {
  value: unknown;
  getSnapshot: () => unknown;
}

/** The hook's fields as React last wrote them, its fiber, and the commit count when it was first watched. */
interface Watched {
  fiber: Fiber;
  value: unknown;
  getSnapshot: () => unknown;
  since: number;
}

/**
 * How a store hook got React to schedule its component: its store notified, or React re-checked the store after a
 * commit and found it changed (`updateStoreInstance`), with no notification at all.
 */
export type StoreCheck = 'notified' | 'resync';

const isInst = (queue: unknown): queue is StoreInst => typeof (queue as StoreInst | null)?.getSnapshot === 'function';

/** Which store hook made React schedule an update: React reads `getSnapshot`, then `value`, just before it does. */
export class StoreChecks {
  private readonly hooks = new WeakMap<StoreInst, Watched>();
  private watched: Array<WeakRef<StoreInst>> = [];
  private pruneAt = 1024;
  private commits = 0;
  /** `getSnapshot` was just read: the start of a check, or a render comparing it. */
  private reading: StoreInst | null = null;
  private readingAfterWrite = false;
  private written: StoreInst | null = null;
  /** A check that just ran; the update it schedules follows on the same stack, before any other hook is read. */
  private checked: StoreInst | null = null;
  private checkedAfterWrite = false;
  private clearing = false;
  /** Checks since the last commit, and the ones the last commit did not render: an update lands in the next commit. */
  private current = new Map<StoreInst, StoreCheck>();
  private carried = new Map<StoreInst, StoreCheck>();
  private stopped = false;

  /** Watches the store hooks of a fiber seen for the first time; `settled`: no update was pending when it was. */
  watch(f: Fiber, settled = false) {
    if (this.stopped || !hasHooks(f)) return;
    for (let h = f.memoizedState as { queue: unknown; next: unknown } | null, i = 0; h && i < 1000; h = h.next as typeof h, i++) {
      const inst = h.queue;
      if (!isInst(inst) || this.hooks.has(inst)) continue;
      const fn = Object.getOwnPropertyDescriptor(inst, 'getSnapshot');
      const value = Object.getOwnPropertyDescriptor(inst, 'value');
      if (!fn?.configurable || !('value' in fn) || !value?.configurable || !('value' in value)) continue;
      const box: Watched = { fiber: f, value: value.value, getSnapshot: fn.value, since: settled ? -1 : this.commits };
      this.hooks.set(inst, box);
      this.watched.push(new WeakRef(inst));
      if (this.watched.length > this.pruneAt) {
        this.watched = this.watched.filter((ref) => ref.deref());
        this.pruneAt = Math.max(1024, this.watched.length * 2);
      }
      Object.defineProperty(inst, 'getSnapshot', {
        configurable: true,
        enumerable: true,
        get: () => {
          this.checked = null;
          this.reading = inst;
          this.readingAfterWrite = this.written === inst;
          this.written = null;
          return box.getSnapshot;
        },
        set: (next: () => unknown) => {
          box.getSnapshot = next;
          this.written = inst;
        },
      });
      Object.defineProperty(inst, 'value', {
        configurable: true,
        enumerable: true,
        get: () => {
          if (this.reading === inst) this.checkedNow(inst);
          this.reading = null;
          return box.value;
        },
        set: (next: unknown) => {
          box.value = next;
        },
      });
    }
  }

  private checkedNow(inst: StoreInst) {
    this.checked = inst;
    this.checkedAfterWrite = this.readingAfterWrite;
    // A check that scheduled nothing must not name a later update of the same component.
    if (!this.clearing) {
      this.clearing = true;
      queueMicrotask(() => {
        this.clearing = false;
        this.checked = null;
      });
    }
  }

  /** Whether every check of this hook since the last commit was seen: none from before the recording started. */
  watches(inst: unknown): boolean {
    const box = isInst(inst) ? this.hooks.get(inst) : undefined;
    return box !== undefined && box.since < this.commits;
  }

  /** Called before React's own post-commit check, so `getSnapshot` is still the previous render's. */
  moved(inst: unknown): boolean {
    const box = isInst(inst) ? this.hooks.get(inst) : undefined;
    if (!box) return false;
    try {
      return !Object.is(box.getSnapshot(), box.value);
    } catch {
      return false;
    }
  }

  /**
   * Called as React schedules an update on `fiber`: the store hook it checked just before, if that check is what
   * scheduled it — the hook is the fiber's own and its store really moved.
   */
  noteUpdate(fiber: Fiber): StoreCheck | null {
    const inst = this.checked;
    this.checked = null;
    const box = inst && this.hooks.get(inst);
    if (!inst || !box || (box.fiber !== fiber && box.fiber.alternate !== fiber)) return null;
    try {
      if (Object.is(box.getSnapshot(), box.value)) return null;
    } catch {
      return null;
    }
    const how: StoreCheck = this.checkedAfterWrite ? 'resync' : 'notified';
    // A notification wins over a resync of the same hook: the store did tell React.
    if (this.current.get(inst) !== 'notified') this.current.set(inst, how);
    return how;
  }

  /** How the hook got its component scheduled since the last commit; undefined when it did not. Asked once a render. */
  check(inst: unknown): StoreCheck | undefined {
    if (!isInst(inst)) return undefined;
    const how = this.current.get(inst) ?? this.carried.get(inst);
    this.current.delete(inst);
    this.carried.delete(inst);
    return how;
  }

  /** A fiber rendered: its hooks' checks are spent, whether or not its reasons were read. */
  rendered(f: Fiber) {
    if (!this.current.size && !this.carried.size) return;
    for (let h = f.memoizedState as { queue: unknown; next: unknown } | null, i = 0; h && i < 1000; h = h.next as typeof h, i++) {
      if (!isInst(h.queue)) continue;
      this.current.delete(h.queue);
      this.carried.delete(h.queue);
    }
  }

  /** After a commit's scan: a check whose component did not render waits one more commit. */
  commit() {
    this.commits++;
    this.carried = this.current;
    this.current = new Map();
  }

  stop() {
    this.stopped = true;
    for (const ref of this.watched) {
      const inst = ref.deref();
      const box = inst && this.hooks.get(inst);
      if (!inst || !box) continue;
      Object.defineProperty(inst, 'getSnapshot', { configurable: true, enumerable: true, writable: true, value: box.getSnapshot });
      Object.defineProperty(inst, 'value', { configurable: true, enumerable: true, writable: true, value: box.value });
    }
    this.watched.length = 0;
    this.current.clear();
    this.carried.clear();
    this.reading = this.written = this.checked = null;
  }
}

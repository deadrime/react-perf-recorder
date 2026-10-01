/** Something noted at `t`, waiting for the frame that paints it; `frame` stays NaN until that frame's rAF. */
export interface Stamped {
  t: number;
  frame: number;
}

/** Waiting longer means a hidden tab, which runs no rAF: what waits must not pile up. */
const KEEP_MS = 2000;

/** One rAF per frame that had changes, shared by the layout shift and largest paint watchers. */
export class FrameClock {
  private pending: Stamped[] = [];
  private armed = false;

  stamp(item: Stamped) {
    if (this.pending.length && this.pending[0].t < item.t - KEEP_MS) this.pending = this.pending.filter((c) => c.t >= item.t - KEEP_MS);
    this.pending.push(item);
    if (this.armed) return;
    this.armed = true;
    // Called before the rendering update that paints the change: a shift's time is that update's layout.
    requestAnimationFrame(() => {
      const now = performance.now();
      for (const c of this.pending) c.frame = now;
      this.pending = [];
      this.armed = false;
    });
  }

  stop() {
    this.pending = [];
  }
}

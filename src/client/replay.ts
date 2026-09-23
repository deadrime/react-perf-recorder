import { dispatchAsUser, endReplayedEvents } from '../core/env/replayed-event';
import type { ReplayPlan, ReplayStep } from '../shared/replay';

export interface ReplayOptions {
  /** Called before each step, 1-based. */
  onStep?(index: number, total: number, step: ReplayStep): void;
  /** Checked between steps and characters: a person pressing Stop ends the replay. */
  cancelled?(): boolean;
  /** How long a step waits for its element to appear. */
  findTimeoutMs?: number;
}

export class ReplayError extends Error {}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function find(step: ReplayStep): Element | null {
  if (!step.selector) return document.activeElement ?? document.body;
  try {
    const all = document.querySelectorAll(step.selector);
    return all[step.nth ?? 0] ?? null;
  } catch {
    return null;
  }
}

async function waitFor(step: ReplayStep, timeoutMs: number, cancelled: () => boolean): Promise<Element | null> {
  const until = performance.now() + timeoutMs;
  for (;;) {
    const el = find(step);
    if (el && (!(el instanceof HTMLElement) || el.isConnected)) return el;
    if (performance.now() > until || cancelled()) return null;
    await sleep(50);
  }
}

/** React keeps its own copy of a field's value: it is set through the prototype's setter so React sees the change. */
function setValue(el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, value: string) {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value')?.set?.call(el, value);
}

const pointer = (el: Element, type: string) =>
  dispatchAsUser(
    el,
    type.startsWith('pointer')
      ? new PointerEvent(type, { bubbles: true, cancelable: true, composed: true, pointerType: 'mouse', isPrimary: true, button: 0 })
      : new MouseEvent(type, { bubbles: true, cancelable: true, composed: true, button: 0, detail: 1 })
  );
const key = (el: Element, type: string, k: string) =>
  dispatchAsUser(el, new KeyboardEvent(type, { key: k, bubbles: true, cancelable: true, composed: true }));

async function perform(step: ReplayStep, el: Element, cancelled: () => boolean) {
  switch (step.kind) {
    case 'click': {
      // The whole press, not just `click`: menus and drag handles listen for the button going down.
      for (const type of ['pointerdown', 'mousedown', 'pointerup', 'mouseup']) pointer(el, type);
      if (el instanceof HTMLElement) el.focus({ preventScroll: true });
      // A dispatched click still does what a click does: checks the box, follows the link, submits the form.
      pointer(el, 'click');
      return;
    }
    case 'typing': {
      if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) throw new ReplayError('the element is not a text field');
      el.focus({ preventScroll: true });
      const chars = step.chars ?? 1;
      // The same number of keystrokes at the same pace; the text itself only when it was recorded.
      const text = step.value && step.value.length >= chars ? step.value.slice(-chars) : 'x'.repeat(chars);
      const gap = chars > 1 ? step.durationMs / (chars - 1) : 0;
      for (let i = 0; i < chars; i++) {
        if (cancelled()) return;
        // Each character as a keyboard makes it: the key goes down, the value changes, the key comes up.
        key(el, 'keydown', text[i]);
        setValue(el, el.value + text[i]);
        dispatchAsUser(el, new InputEvent('input', { bubbles: true, composed: true, inputType: 'insertText', data: text[i] }));
        key(el, 'keyup', text[i]);
        if (i < chars - 1) await sleep(gap);
      }
      return;
    }
    case 'key': {
      key(el, 'keydown', step.key ?? '');
      key(el, 'keyup', step.key ?? '');
      return;
    }
    case 'change': {
      if (el instanceof HTMLSelectElement && step.value !== undefined) {
        setValue(el, step.value);
        dispatchAsUser(el, new Event('input', { bubbles: true }));
        dispatchAsUser(el, new Event('change', { bubbles: true }));
      } else pointer(el, 'click');
      return;
    }
    case 'submit': {
      // A key press made by a script submits nothing: the submit that followed Enter is asked for directly.
      const form = el instanceof HTMLFormElement ? el : el.closest('form');
      if (form) dispatchAsUser(form, new SubmitEvent('submit', { bubbles: true, cancelable: true }));
      return;
    }
    case 'scroll': {
      const target = step.selector ? el : document.scrollingElement;
      if (target && step.scrollTo !== undefined) target.scrollTop = step.scrollTo;
      return;
    }
  }
}

/**
 * Does the steps of a recording again, at its pace: the same gaps between actions, the same speed of typing, the
 * same tail after the last one. A step whose element never shows up stops the replay with the step named, rather
 * than clicking something else.
 */
export async function replay(plan: ReplayPlan, options: ReplayOptions = {}): Promise<void> {
  try {
    await run(plan, options);
  } finally {
    endReplayedEvents();
  }
}

async function run(plan: ReplayPlan, options: ReplayOptions) {
  const cancelled = options.cancelled ?? (() => false);
  const total = plan.steps.length;
  // Kept to the original's clock, so typing that took its time does not push every later step back.
  const start = performance.now();
  let at = 0;
  for (let i = 0; i < total; i++) {
    const step = plan.steps[i];
    if (cancelled()) return;
    at += step.afterMs;
    await sleep(Math.max(0, start + at - performance.now()));
    options.onStep?.(i + 1, total, step);
    const el = await waitFor(step, options.findTimeoutMs ?? 5000, cancelled);
    if (cancelled()) return;
    if (!el) throw new ReplayError(`step ${i + 1} of ${total} (${step.what}): the element is not on the page`);
    try {
      await perform(step, el, cancelled);
    } catch (error) {
      if (error instanceof ReplayError) throw new ReplayError(`step ${i + 1} of ${total} (${step.what}): ${error.message}`);
      throw error;
    }
  }
  const until = performance.now() + plan.tailMs;
  while (performance.now() < until && !cancelled()) await sleep(50);
}

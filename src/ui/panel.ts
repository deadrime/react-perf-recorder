import type { Engine, Owner, Saved } from '../core/engine';
import { currentOf, type Fiber, type FiberRoot } from '../core/fiber';
import { scopeNames, type ScopeHandle } from '../core/scope';
import type { Highlighter } from '../overlay/highlight';
import { NOTE_IN_PANEL, renderPanel, type PanelHandlers, type PanelViewProps } from './components/PanelView';
import { rowCopyKey, type TreeProps } from './components/Tree';
import { describeArea } from './describe';
import { Picker, type TreeActions, type TreeRow } from './picker';
import { matches } from './shortcuts';
import { dockOf, dockStyle } from './dock';
import { compareDigests, digestOf } from '../shared/compare';
import { planReplay, type ReplayPlan } from '../shared/replay';
import type { Comparison } from './components/Compare';
import { defaults, loadState, saveState, setRecordOnLoad, takePrevious, type Corner, type PanelState } from './storage';
import { STYLES } from './styles';

export interface PanelOptions {
  corner: Corner;
  highlight: boolean;
  shortcuts: { record: string; pick: string };
  interrupted: { id: string } | null;
}

type Message = PanelViewProps['message'];

/**
 * Everything the panel knows lives here; the markup is a preact view of it (`components/PanelView.tsx`),
 * redrawn from `sync()`.
 * The view is rendered into the panel's own shadow root, never into the page: the app's React never sees it.
 */
export class Panel {
  readonly host: HTMLDivElement;
  private shadow: ShadowRoot;
  private container: HTMLDivElement;
  private state: PanelState;
  private scope: ScopeHandle | null = null;
  private before: { scope: ScopeHandle | null; last: PanelState['lastScope'] } = { scope: null, last: null };
  private liveTimer: ReturnType<typeof setInterval> | null = null;
  private picker: Picker;
  private busy = false;
  private visible: boolean;
  private tree: TreeProps | null = null;
  private result: Saved | null = null;
  private message: Message = { text: '', kind: 'muted' };
  private highlighter: Highlighter | null = null;
  /** The pointer that just finished a drag of the dot; its click opens nothing. */
  private dragged = false;
  private readonly handlers: PanelHandlers;

  constructor(private engine: Engine, private options: PanelOptions) {
    this.host = document.createElement('div');
    this.host.setAttribute('data-react-perf-recorder', '');
    this.shadow = this.host.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = STYLES;
    this.container = document.createElement('div');
    this.shadow.append(style, this.container);
    this.state = loadState(defaults(options.corner, options.highlight));
    this.handlers = this.buildHandlers();
    this.picker = new Picker(this.shadow, this.host, engine, () => ({ library: this.state.showLibrary, providers: this.state.showProviders }), {
      showTree: (rows, active, actions) => this.showTree(rows, active, actions),
      preview: (owner) => this.setScope(owner ? this.engine.scopeFromFiber(owner.fiber) : null),
      done: (choice) => this.onPicked(choice),
    });
    engine.onChange(() => this.adoptRecordingScope() || this.sync());
    window.addEventListener('keydown', (e) => this.onShortcut(e), true);
    this.visible = this.initialVisibility();
    if (options.interrupted)
      this.say(`The previous recording was cut by a page reload; its events are saved in session ${options.interrupted.id}.`, 'notice');
    this.sync();
    this.restoreScope();
  }

  setHighlighter(highlighter: Highlighter) {
    this.highlighter = highlighter;
    highlighter.enabled = this.visible && this.state.highlight;
  }

  /** Panel host goes on <html>, outside body: the app's root lookups and DOM observers never see it. */
  mount() {
    document.documentElement.appendChild(this.host);
    this.syncIdleHighlight();
  }

  get shadowRoot() {
    return this.shadow;
  }

  /** Something the view shows has changed outside the panel — a component's file came back from the dev server. */
  redraw() {
    this.sync();
  }

  show() {
    this.visible = true;
    this.state.visible = true;
    this.state.collapsed = false;
    this.persist();
    this.sync();
    this.syncIdleHighlight();
  }

  /** Renders in the area are outlined all the time the panel is shown, not only while recording. */
  private syncIdleHighlight() {
    const on = this.visible && this.state.highlight;
    // A hidden panel draws nothing, so an automated browser gets clean screenshots.
    if (this.highlighter) this.highlighter.enabled = on;
    this.engine.highlightWhenIdle(on, this.scope);
  }

  private initialVisibility() {
    const flag = new URLSearchParams(location.search).get('rpr');
    // Asking for the panel by hand means the card, not the dot it collapses to.
    if (flag === 'panel' || flag === 'rec') {
      this.state.visible = true;
      this.state.collapsed = false;
    }
    if (flag === 'off') this.state.visible = false;
    if (flag) this.persist();
    // Automated browsers (e2e, playwright-mcp) get no panel unless asked: it would cover clicks and screenshots.
    return this.state.visible ?? !navigator.webdriver;
  }

  /** What the view can ask for, in one place; each line is a method below. */
  private buildHandlers(): PanelHandlers {
    return {
      record: () => void this.start(),
      recordOnLoad: () => this.reloadIntoRecording(),
      repeat: () => this.repeat(),
      stop: () => void this.stop(),
      pick: () => this.togglePicker(),
      editScope: () => this.editScope(),
      copyScope: () => this.copyScope(),
      // With the tree open, × moves it to its Whole app row instead of leaving the old area active in it.
      clearScope: () => (this.picker.active ? this.picker.release() : this.setScope(null)),
      outlineScope: (on) => this.outlineScope(on),
      setHighlight: (on) => this.setHighlight(on),
      setNote: (text) => this.setNote(text),
      unwatch: (name) => this.toggleWatch(name),
      setCollapsed: (collapsed) => this.setCollapsed(collapsed),
      openFromDot: () => this.openFromDot(),
      setWide: (wide) => {
        this.state.wide = wide;
        this.persist();
        this.sync();
      },
      dragStart: (event) => this.onDragStart(event),
      outlineRoots: (entries) => this.outlineRoots(entries),
      dismissResult: () => {
        this.highlighter?.pin([]);
        this.result = null;
        this.compared = null;
        this.sync();
      },
    };
  }

  /** The area, the note and the watched components are put aside, so the reloaded page can pick the recording up. */
  private reloadIntoRecording(replay?: ReplayPlan) {
    setRecordOnLoad({
      ...(this.scope ? { names: scopeNames(this.scope) } : {}),
      ...(this.state.watch.length ? { watch: this.state.watch } : {}),
      label: replay ? `replay of ${replay.from ?? 'the last recording'}` : (NOTE_IN_PANEL && this.state.label) || 'from page load',
      ...(replay ? { replay } : {}),
    });
    location.reload();
  }

  private copyScope() {
    const target = this.scopeTarget();
    if (target) this.copyArea(target, 'scope');
  }

  /**
   * The clipboard is written in the same task as the click, never after an await: a copy that leaves the user's
   * gesture is a copy browsers may refuse. On React 19 the file's line comes from the dev server, and picking the
   * area is what asked for it — by the time anyone reaches this button the answer is in.
   */
  private copyArea(fiber: Fiber, key: string) {
    void this.copy(describeArea(this.engine, fiber), key);
  }

  /**
   * The area picked before the page reloaded, found again by its component path once the app has rendered it — the
   * way the corner and the highlight are remembered. A page that does not have that component leaves the whole app
   * as the area and says nothing; a recording that has already started is left as it began.
   */
  private restoreScope() {
    const last = this.state.lastScope;
    if (!last || this.scope) return;
    const deadline = Date.now() + 8000;
    const attempt = () => {
      // Picked, cleared or recording in the meantime: the person has moved on.
      if (this.scope || this.state.lastScope !== last || this.engine.recording) return;
      try {
        this.setScope(this.engine.scopeFromNames(last.names), last);
      } catch {
        if (Date.now() < deadline) setTimeout(attempt, 250);
      }
    };
    attempt();
  }

  /**
   * A recording from the page load finds its area itself, before the panel's own search does and then stops; the
   * panel shows that area, or the pill says Pick while the recording is of one component only.
   */
  private adoptRecordingScope(): boolean {
    const handle = this.engine.scopeOfRecording;
    if (this.scope || !handle) return false;
    this.setScope(handle);
    return true;
  }

  /** Hovering the area's name outlines it on the page, unless the picker is already drawing something. */
  private outlineScope(on: boolean) {
    if (!on) return this.picker.hideOutline();
    const target = this.scopeTarget();
    if (target && !this.picker.active) this.picker.outline(target, this.scope!.name);
  }

  private setHighlight(on: boolean) {
    this.state.highlight = on;
    if (!on) this.highlighter?.reset();
    this.persist();
    this.sync();
    this.syncIdleHighlight();
  }

  private setNote(text: string) {
    this.state.label = text;
    this.persist();
    this.sync();
  }

  private sync() {
    const recording = this.engine.recording;
    if (recording && !this.liveTimer) this.liveTimer = setInterval(() => this.sync(), 250);
    if (!recording && this.liveTimer) {
      clearInterval(this.liveTimer);
      this.liveTimer = null;
    }
    renderPanel(this.container, this.viewProps(recording));
  }

  private viewProps(recording: boolean): PanelViewProps {
    const live = this.engine.live();
    return {
      visible: this.visible,
      collapsed: this.state.collapsed,
      recording,
      busy: this.busy,
      corner: this.state.corner,
      offset: this.state.offset,
      wide: Boolean(this.state.wide),
      copied: this.copied,
      shortcuts: this.options.shortcuts,
      scope: this.scope ? { name: this.scope.name, lost: live?.scopeState === 'lost' } : null,
      note: this.state.label,
      highlight: this.state.highlight,
      watched: this.state.watch,
      live,
      message: this.message,
      tree: this.tree,
      result: this.result,
      compared: this.compared,
      replaying: this.replaying,
      on: this.handlers,
    };
  }

  private toggleWatch(name: string) {
    this.state.watch = this.state.watch.includes(name) ? this.state.watch.filter((n) => n !== name) : [...this.state.watch, name].slice(0, 12);
    this.persist();
    this.sync();
    this.picker.refresh();
  }

  private async start() {
    if (this.engine.recording || this.busy) return;
    this.picker.cancel();
    this.result = null;
    this.say('');
    try {
      this.highlighter?.reset();
      this.engine.start({
        source: 'panel',
        scope: this.scope,
        label: (NOTE_IN_PANEL && this.state.label) || undefined,
        ...(this.state.watch.length ? { watch: this.state.watch } : {}),
      });
    } catch (error) {
      this.say(String((error as Error)?.message ?? error), 'error');
    }
    this.sync();
  }

  /** The roots of a picked commit or action, on the page as it is now: every instance of each, labelled with its hits. */
  private outlineRoots(entries: Array<{ i: number; hits: number }> | null): number {
    const rec = this.result;
    if (!entries || !rec) {
      this.highlighter?.pin([]);
      return 0;
    }
    const roots = [...rec.roots, ...rec.outsideRoots];
    const items = entries.flatMap(({ i, hits }) => {
      const root = roots[i];
      if (!root) return [];
      return this.engine.findComponents(root.name, root.source).map((fiber) => ({ fiber, label: `${root.name} ×${hits}` }));
    });
    this.highlighter?.pin(items);
    return items.length;
  }

  /** Reloads and does the actions of the report again, recording: the same scenario after a change of the code. */
  private repeat() {
    if (!this.result || this.engine.recording) return;
    const plan = planReplay(this.result);
    if (!plan.steps.length) return;
    this.reloadIntoRecording(plan);
  }

  /** Where a replay is: the header says it instead of the running numbers. */
  private replaying: { at: number; of: number } | null = null;

  replayProgress(at: number | null, of = 0) {
    this.replaying = at === null ? null : { at, of };
    this.sync();
  }

  /** A replay has done its steps: stop as Stop does, and say why if it could not finish them. */
  async finish(failure: string | null) {
    await this.stop();
    if (failure) this.say(failure, 'error');
  }

  /** The last recording against the one before it in this tab, when they are of the same page and area. */
  private compared: Comparison | null = null;

  private async stop() {
    if (!this.engine.recording) return;
    this.busy = true;
    this.sync();
    try {
      this.result = await this.engine.stop();
      this.compared = compareWithPrevious(this.result);
    } catch (error) {
      this.say(String((error as Error)?.message ?? error), 'error');
    } finally {
      this.busy = false;
      this.sync();
    }
  }

  private togglePicker() {
    if (this.picker.active) {
      this.picker.cancel();
      return;
    }
    this.setCollapsed(false);
    this.rememberScope();
    // With no area yet, the tree of the whole app opens at its top: a component can be chosen from the tree as well
    // as from the page, and the whole app stays the area until one is.
    const top = this.scope ? null : this.engine.topComponent({ library: this.state.showLibrary, providers: this.state.showProviders });
    // Two short lines: the one thing to do, then the keys. The page ignores the clicks meanwhile.
    this.say(
      `Click ${top ? 'an element or a row' : 'an element'} to take it as the area.\n↑↓ move · →← in and out · Enter keep · Esc cancel`,
      'muted'
    );
    if (top) this.picker.startAt(top, { quiet: true });
    else this.picker.start();
  }

  /** Reopens the tree on the current area; without one, picks from scratch. */
  private editScope() {
    if (this.engine.recording) return;
    const target = this.scopeTarget();
    if (!target) return this.togglePicker();
    this.picker.cancel();
    this.setCollapsed(false);
    this.rememberScope();
    this.say('Click the page to pick elsewhere.\n↑↓ move · →← in and out · Enter keep · Esc cancel', 'muted');
    this.picker.startAt(target);
  }

  /** The area as it was before the tree opened: Esc puts it back, whatever was tried in between. */
  private rememberScope() {
    this.before = { scope: this.scope, last: this.state.lastScope };
  }

  /** The committed fiber of the area; after a remount the area is found again by its component path. */
  private scopeTarget(): Fiber | null {
    if (!this.scope) return null;
    const target = currentOf(this.scope.chain[this.scope.chain.length - 1]);
    // React cuts `return` of deleted fibers, so only a mounted one leads up to the committed root.
    let top = target;
    while (top.return) top = top.return;
    if ((top.stateNode as FiberRoot | null)?.current === top) return target;
    try {
      this.scope = this.engine.scopeFromNames(scopeNames(this.scope));
      return this.scope.chain[this.scope.chain.length - 1];
    } catch {
      this.say(`${this.scope.name} is not on the page now.`, 'notice');
      return null;
    }
  }

  /** What was just copied, by the key of the button that copied it: that button shows a tick for a moment. */
  private copied: string | null = null;
  private copiedTimer: ReturnType<typeof setTimeout> | null = null;

  private async copy(text: string, key: string) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // No clipboard API outside secure contexts: fall back to a selected textarea.
      const area = document.createElement('textarea');
      area.value = text;
      this.shadow.append(area);
      area.select();
      document.execCommand('copy');
      area.remove();
    }
    // The button says it worked where the eye already is, instead of a sentence somewhere below it.
    this.copied = key;
    if (this.copiedTimer) clearTimeout(this.copiedTimer);
    this.copiedTimer = setTimeout(() => {
      this.copied = null;
      this.sync();
    }, 1500);
    this.sync();
  }

  private onPicked(owner: Owner | 'whole-app' | null) {
    this.tree = null;
    this.say('');
    if (owner === 'whole-app') this.setScope(null);
    else if (owner) this.setScope(this.engine.scopeFromFiber(owner.fiber));
    else this.setScope(this.before.scope, this.before.last);
  }

  private setScope(scope: ScopeHandle | null, last = scope ? { names: scopeNames(scope), label: scope.name } : null) {
    this.scope = scope;
    this.state.lastScope = last;
    this.highlighter?.reset();
    this.persist();
    this.sync();
    this.syncIdleHighlight();
  }

  private showTree(rows: TreeRow[], active: number, actions: TreeActions) {
    this.tree = {
      rows,
      active,
      actions,
      showLibrary: this.state.showLibrary,
      showProviders: this.state.showProviders,
      watched: this.state.watch,
      onShow: (what, on) => {
        if (what === 'library') this.state.showLibrary = on;
        else this.state.showProviders = on;
        this.persist();
        this.picker.refresh();
      },
      onWatch: (name) => this.toggleWatch(name),
      onCopy: (owner) => this.copyArea(owner.fiber, rowCopyKey(owner)),
    };
    this.sync();
  }

  private say(text: string, kind: Message['kind'] = 'muted') {
    this.message = { text, kind };
    this.sync();
  }

  private setCollapsed(collapsed: boolean) {
    this.state.collapsed = collapsed;
    this.persist();
    this.sync();
  }

  private onShortcut(event: KeyboardEvent) {
    if (matches(this.options.shortcuts.record, event)) {
      event.preventDefault();
      this.show();
      void (this.engine.recording ? this.stop() : this.start());
    } else if (matches(this.options.shortcuts.pick, event)) {
      event.preventDefault();
      this.show();
      if (!this.engine.recording) this.togglePicker();
    }
  }

  /**
   * Dragging stays out of the view: it moves the panel by inline styles, which no render touches, and on release
   * the edge it landed by becomes state, with the place along that edge. The card is dragged by its header, the
   * dot by itself — and the dot is a button, so the drag only takes over once the pointer has really moved, and
   * the click that opens the panel is swallowed only then.
   */
  private onDragStart(down: PointerEvent) {
    const handle = down.currentTarget as HTMLElement;
    const fromDot = handle.classList.contains('dot');
    if (!fromDot && (down.target as Element).closest('button, label')) return;
    const root = handle.closest('.rpr') as HTMLElement | null;
    if (!root) return;
    const rect = root.getBoundingClientRect();
    const dx = down.clientX - rect.left;
    const dy = down.clientY - rect.top;
    let moved = false;
    const move = (e: PointerEvent) => {
      if (!moved && Math.abs(e.clientX - down.clientX) + Math.abs(e.clientY - down.clientY) < 4) return;
      if (!moved) {
        moved = true;
        root.dataset.dragging = 'true';
        // Held by the pointer from here on: a release past the edge of the window still ends the drag, instead of
        // leaving the panel stuck to the cursor.
        handle.setPointerCapture?.(down.pointerId);
      }
      Object.assign(root.style, { left: `${e.clientX - dx}px`, top: `${e.clientY - dy}px`, right: 'auto', bottom: 'auto' });
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      if (moved) handle.releasePointerCapture?.(down.pointerId);
      delete root.dataset.dragging;
      if (!moved) return;
      // It sticks to the nearest edge, at the place along it where it was let go of; the view draws that now.
      this.dragged = fromDot;
      const dock = dockOf(root.getBoundingClientRect(), { width: innerWidth, height: innerHeight });
      this.state.corner = dock.corner;
      this.state.offset = dock.offset;
      // The dock as the view would write it: a drop that lands on the same one leaves preact nothing to patch, so
      // the drag's own left/top are replaced here rather than on the next render.
      root.style.cssText = dockStyle(dock.corner, dock.offset) ?? '';
      this.persist();
      this.sync();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  }

  /** A drag that started on the dot ends in a click; that one click must not open the panel. */
  private openFromDot() {
    if (this.dragged) {
      this.dragged = false;
      return;
    }
    this.setCollapsed(false);
  }

  private persist() {
    saveState(this.state);
  }
}

/** Worth a place in the report only when the two runs share something to set side by side. */
function compareWithPrevious(rec: Saved): Comparison | null {
  const digest = digestOf(rec);
  const previous = takePrevious(digest);
  if (!previous || (previous.id && previous.id === digest.id)) return null;
  const result = compareDigests(previous, digest);
  const wastedMoved = !result.startedDifferently && Math.abs(result.wastedPerSec.delta ?? 0) >= 1;
  if (!result.comparable || (!result.actions.length && !wastedMoved)) return null;
  return { ...result, since: previous.createdAt };
}

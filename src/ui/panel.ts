import type { Engine, Owner, Saved } from '../core/engine';
import { currentOf, type Fiber, type FiberRoot } from '../core/fiber';
import { scopeNames, type ScopeHandle } from '../core/scope';
import type { Highlighter } from '../overlay/highlight';
import { renderPanel, type PanelHandlers, type PanelViewProps } from './components/PanelView';
import type { TreeProps } from './components/Tree';
import { describeArea } from './describe';
import { Picker, type TreeActions, type TreeRow } from './picker';
import { matches } from './shortcuts';
import { defaults, loadState, saveState, setRecordOnLoad, type Corner, type PanelState } from './storage';
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
      preview: (owner) => this.setScope(this.engine.scopeFromFiber(owner.fiber)),
      done: (owner) => this.onPicked(owner),
    });
    engine.onChange(() => this.sync());
    window.addEventListener('keydown', (e) => this.onShortcut(e), true);
    this.visible = this.initialVisibility();
    if (options.interrupted)
      this.say(`The previous recording was cut by a page reload; its events are saved in session ${options.interrupted.id}.`, 'notice');
    this.sync();
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
      stop: () => void this.stop(),
      pick: () => this.togglePicker(),
      editScope: () => this.editScope(),
      copyScope: () => this.copyScope(),
      clearScope: () => this.setScope(null),
      lastScope: () => this.findLastScope(),
      outlineScope: (on) => this.outlineScope(on),
      setHighlight: (on) => this.setHighlight(on),
      setNote: (text) => this.setNote(text),
      unwatch: (name) => this.toggleWatch(name),
      setCollapsed: (collapsed) => this.setCollapsed(collapsed),
      dragStart: (event) => this.onDragStart(event),
      dismissResult: () => {
        this.result = null;
        this.sync();
      },
    };
  }

  /** The area, the note and the watched components are put aside, so the reloaded page can pick the recording up. */
  private reloadIntoRecording() {
    setRecordOnLoad({
      ...(this.scope ? { names: scopeNames(this.scope) } : {}),
      ...(this.state.watch.length ? { watch: this.state.watch } : {}),
      label: this.state.label || 'from page load',
    });
    location.reload();
  }

  private copyScope() {
    const target = this.scopeTarget();
    if (target) void this.copy(describeArea(this.engine, target), 'Area copied: paste it into the chat with the assistant.');
  }

  private findLastScope() {
    try {
      if (this.state.lastScope) this.setScope(this.engine.scopeFromNames(this.state.lastScope.names));
    } catch (error) {
      this.say(String((error as Error)?.message ?? error), 'error');
    }
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
      shortcuts: this.options.shortcuts,
      scope: this.scope ? { name: this.scope.name, lost: live?.scopeState === 'lost' } : null,
      lastScope: this.state.lastScope?.label ?? null,
      note: this.state.label,
      highlight: this.state.highlight,
      watched: this.state.watch,
      live,
      message: this.message,
      tree: this.tree,
      result: this.result,
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
        label: this.state.label || undefined,
        ...(this.state.watch.length ? { watch: this.state.watch } : {}),
      });
    } catch (error) {
      this.say(String((error as Error)?.message ?? error), 'error');
    }
    this.sync();
  }

  private async stop() {
    if (!this.engine.recording) return;
    this.busy = true;
    this.sync();
    try {
      this.result = await this.engine.stop();
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
    this.say('Click an element on the page: it becomes the area at once. Then ↑/↓ move it, →/← go in and out, Enter keeps it, Esc puts the old one back.', 'muted');
    this.picker.start();
  }

  /** Reopens the tree on the current area; without one, picks from scratch. */
  private editScope() {
    if (this.engine.recording) return;
    const target = this.scopeTarget();
    if (!target) return this.togglePicker();
    this.picker.cancel();
    this.setCollapsed(false);
    this.rememberScope();
    this.say('↑/↓ move the area, → goes inside, ← goes up, Enter keeps it, Esc puts the old one back; click the page to pick elsewhere.', 'muted');
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

  private async copy(text: string, done: string) {
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
    this.say(done, 'muted');
  }

  private onPicked(owner: Owner | null) {
    this.tree = null;
    this.say('');
    if (owner) this.setScope(this.engine.scopeFromFiber(owner.fiber));
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
      onCopy: (owner) => void this.copy(describeArea(this.engine, owner.fiber), `${owner.name} copied: paste it into the chat with the assistant.`),
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

  /** Dragging stays out of the view: it moves the card by inline styles, which no render touches. */
  private onDragStart(down: PointerEvent) {
    if ((down.target as Element).closest('button')) return;
    const root = (down.currentTarget as HTMLElement).closest('.rpr') as HTMLElement | null;
    if (!root) return;
    const rect = root.getBoundingClientRect();
    const dx = down.clientX - rect.left;
    const dy = down.clientY - rect.top;
    const move = (e: PointerEvent) =>
      Object.assign(root.style, { left: `${e.clientX - dx}px`, top: `${e.clientY - dy}px`, right: 'auto', bottom: 'auto' });
    const up = (e: PointerEvent) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      // Snap to the nearest corner: positions survive a resize and a reload.
      this.state.corner = `${e.clientY > innerHeight / 2 ? 'bottom' : 'top'}-${e.clientX > innerWidth / 2 ? 'right' : 'left'}` as Corner;
      root.removeAttribute('style');
      this.persist();
      this.sync();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  private persist() {
    saveState(this.state);
  }
}

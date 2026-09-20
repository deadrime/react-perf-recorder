import type { Engine, Owner } from '../core/engine';
import { currentOf, type Fiber, type FiberRoot } from '../core/fiber';
import type { ScopeHandle } from '../core/scope';
import type { Highlighter } from '../overlay/highlight';
import { describeArea } from './describe';
import { clearResult, renderResult } from './result-view';
import { h } from './dom';
import { clearTree, renderTree } from './tree-view';
import { Picker, type TreeActions, type TreeRow } from './picker';
import { defaults, loadState, saveState, setRecordOnLoad, type Corner, type PanelState } from './storage';
import { STYLES } from './styles';

export interface PanelOptions {
  corner: Corner;
  highlight: boolean;
  shortcuts: { record: string; pick: string };
  interrupted: { id: string } | null;
}

/** `Alt+Shift+KeyR` against a keyboard event; `code`, not `key`: on macOS Alt changes the character. */
const matches = (shortcut: string, event: KeyboardEvent) => {
  const parts = shortcut.split('+');
  const code = parts.pop();
  const has = (m: string) => parts.includes(m);
  return (
    event.code === code &&
    event.altKey === has('Alt') &&
    event.shiftKey === has('Shift') &&
    event.ctrlKey === has('Ctrl') &&
    event.metaKey === has('Meta')
  );
};

export class Panel {
  readonly host: HTMLDivElement;
  private shadow: ShadowRoot;
  private root: HTMLDivElement;
  private state: PanelState;
  private scope: ScopeHandle | null = null;
  private before: { scope: ScopeHandle | null; last: PanelState['lastScope'] } = { scope: null, last: null };
  private liveTimer: ReturnType<typeof setInterval> | null = null;
  private picker: Picker;
  private busy = false;
  private els!: {
    live: HTMLSpanElement;
    liveRoots: HTMLDivElement;
    record: HTMLButtonElement;
    recordOnLoad: HTMLButtonElement;
    stop: HTMLButtonElement;
    pick: HTMLButtonElement;
    scope: HTMLButtonElement;
    copyScope: HTMLButtonElement;
    clearScope: HTMLButtonElement;
    lastScope: HTMLButtonElement;
    highlight: HTMLInputElement;
    note: HTMLInputElement;
    watch: HTMLDivElement;
    picker: HTMLDivElement;
    result: HTMLDivElement;
    message: HTMLDivElement;
  };

  private highlighter: Highlighter | null = null;

  constructor(private engine: Engine, private options: PanelOptions) {
    this.host = document.createElement('div');
    this.host.setAttribute('data-react-perf-recorder', '');
    this.shadow = this.host.attachShadow({ mode: 'open' });
    this.shadow.append(h('style', {}, STYLES));
    this.state = loadState(defaults(options.corner, options.highlight));
    this.root = this.build();
    this.shadow.append(this.root);
    this.picker = new Picker(this.shadow, this.host, engine, () => this.state.showWrappers, {
      showTree: (rows, active, actions) => this.showTree(rows, active, actions),
      preview: (owner) => this.setScope(this.engine.scopeFromFiber(owner.fiber)),
      done: (owner) => this.onPicked(owner),
    });
    engine.onChange(() => this.sync());
    window.addEventListener('keydown', (e) => this.onShortcut(e), true);
    const visible = this.initialVisibility();
    this.root.hidden = !visible;
    if (options.interrupted)
      this.say(`The previous recording was cut by a page reload; its events are saved in session ${options.interrupted.id}.`, 'notice');
    this.sync();
  }

  setHighlighter(highlighter: Highlighter) {
    this.highlighter = highlighter;
    highlighter.enabled = !this.root.hidden && this.state.highlight;
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
    this.root.hidden = false;
    this.state.visible = true;
    this.state.collapsed = false;
    this.persist();
    this.sync();
    this.syncIdleHighlight();
  }

  /** Renders in the area are outlined all the time the panel is shown, not only while recording. */
  private syncIdleHighlight() {
    const on = !this.root.hidden && this.state.highlight;
    // A hidden panel draws nothing, so an automated browser gets clean screenshots.
    if (this.highlighter) this.highlighter.enabled = on;
    this.engine.highlightWhenIdle(on, this.scope);
  }

  private initialVisibility() {
    const flag = new URLSearchParams(location.search).get('rpr');
    if (flag === 'panel' || flag === 'rec') this.state.visible = true;
    if (flag === 'off') this.state.visible = false;
    if (flag) this.persist();
    // Automated browsers (e2e, playwright-mcp) get no panel unless asked: it would cover clicks and screenshots.
    return this.state.visible ?? !navigator.webdriver;
  }

  private build() {
    const card = h('div', { class: 'card' });
    const live = h('span', { class: 'live' });
    const collapse = h('button', { title: 'Collapse', 'data-rpr': 'collapse' }, '–');
    const header = h('header', {}, h('span', { class: 'title' }, 'perf'), live, collapse);
    const record = h('button', { class: 'rec', 'data-rpr': 'record', title: `Start recording (${this.options.shortcuts.record})` }, '● Rec');
    const recordOnLoad = h(
      'button',
      { class: 'rec', 'data-rpr': 'record-on-load', title: 'Reload the page and record from its first render' },
      '⟳ Load'
    );
    const stop = h('button', { class: 'stop', 'data-rpr': 'stop', title: `Stop (${this.options.shortcuts.record})` }, '■ Stop');
    const pick = h('button', { 'data-rpr': 'pick', title: `Pick an area (${this.options.shortcuts.pick})` }, '⌖ Area');
    const scope = h('button', { class: 'scope', 'data-rpr': 'scope', title: 'Click to change the area, hover to outline it' }, 'Whole app');
    const copyScope = h('button', { 'data-rpr': 'copy-scope', title: 'Copy the area as text for an AI assistant: component, file, path, DOM' }, '⧉');
    const clearScope = h('button', { 'data-rpr': 'clear-scope', title: 'Record the whole app' }, '×');
    const lastScope = h('button', { 'data-rpr': 'last-scope', title: 'Find the last area again' }, '↺');
    const highlight = h('input', { type: 'checkbox', 'data-rpr': 'highlight' });
    const note = h('input', {
      type: 'text',
      'data-rpr': 'note',
      placeholder: 'what you are testing, e.g. typing the amount',
      title: 'Saved with the recording and shown in the list of recordings, so you and the agent can tell them apart',
    });
    const watch = h('div', { class: 'row watch', 'data-rpr': 'watch' });
    const liveRoots = h('div', { class: 'live-roots', 'data-rpr': 'live-roots' });
    const picker = h('div', { class: 'picker', 'data-rpr': 'picker' });
    const result = h('div', { class: 'result', 'data-rpr': 'result' });
    const message = h('div', { 'data-rpr': 'message' });
    card.append(
      header,
      h(
        'div',
        { class: 'row' },
        record,
        recordOnLoad,
        stop,
        pick,
        scope,
        copyScope,
        clearScope,
        lastScope,
        h('label', { class: 'toggle', title: 'Outline renders in the area, also between recordings' }, highlight, 'highlight')
      ),
      h('label', { class: 'row note' }, h('span', { class: 'muted' }, 'Note'), note),
      watch,
      liveRoots,
      picker,
      message,
      result
    );
    const dot = h('button', { class: 'dot', 'data-rpr': 'toggle', title: `react-perf-recorder (${this.options.shortcuts.record})` }, '●');
    const root = h('div', { class: 'rpr' }, dot, card);
    this.els = {
      live,
      liveRoots,
      record,
      recordOnLoad,
      stop,
      pick,
      scope,
      copyScope,
      clearScope,
      lastScope,
      highlight,
      note,
      watch,
      picker,
      result,
      message,
    };
    highlight.checked = this.state.highlight;
    note.value = this.state.label;
    dot.addEventListener('click', () => this.setCollapsed(false));
    collapse.addEventListener('click', () => this.setCollapsed(true));
    record.addEventListener('click', () => void this.start());
    recordOnLoad.addEventListener('click', () => {
      setRecordOnLoad({
        ...(this.scope ? { names: scopeNames(this.scope) } : {}),
        ...(this.state.watch.length ? { watch: this.state.watch } : {}),
        label: this.state.label || 'from page load',
      });
      location.reload();
    });
    stop.addEventListener('click', () => void this.stop());
    pick.addEventListener('click', () => this.togglePicker());
    scope.addEventListener('click', () => this.editScope());
    scope.addEventListener('mouseenter', () => {
      const target = this.scopeTarget();
      if (target && !this.picker.active) this.picker.outline(target, this.scope!.name);
    });
    scope.addEventListener('mouseleave', () => this.picker.hideOutline());
    copyScope.addEventListener('click', () => {
      const target = this.scopeTarget();
      if (target) void this.copy(describeArea(this.engine, target), 'Area copied: paste it into the chat with the assistant.');
    });
    clearScope.addEventListener('click', () => this.setScope(null));
    lastScope.addEventListener('click', () => {
      try {
        if (this.state.lastScope) this.setScope(this.engine.scopeFromNames(this.state.lastScope.names));
      } catch (error) {
        this.say(String((error as Error)?.message ?? error), 'error');
      }
    });
    highlight.addEventListener('change', () => {
      this.state.highlight = highlight.checked;
      if (!highlight.checked) this.highlighter?.reset();
      this.persist();
      this.syncIdleHighlight();
    });
    note.addEventListener('input', () => {
      this.state.label = note.value;
      this.persist();
    });
    this.enableDrag(header, root);
    return root;
  }

  private sync() {
    const recording = this.engine.recording;
    this.root.dataset.corner = this.state.corner;
    this.root.dataset.collapsed = String(this.state.collapsed && !recording);
    this.root.dataset.recording = String(recording);
    this.els.record.hidden = recording || this.busy;
    this.els.recordOnLoad.hidden = recording || this.busy;
    this.els.stop.hidden = !recording;
    this.els.pick.disabled = recording;
    this.els.scope.disabled = recording;
    this.els.copyScope.hidden = !this.scope;
    this.els.clearScope.hidden = !this.scope || recording;
    this.els.lastScope.hidden = Boolean(this.scope) || !this.state.lastScope || recording;
    this.els.lastScope.title = this.state.lastScope ? `Find ${this.state.lastScope.label} again` : '';
    this.els.scope.textContent = this.scope ? `${this.scope.name}` : 'Whole app';
    this.renderWatch(recording);
    if (recording && !this.liveTimer) this.liveTimer = setInterval(() => this.updateLive(), 250);
    if (!recording && this.liveTimer) {
      clearInterval(this.liveTimer);
      this.liveTimer = null;
    }
    this.updateLive();
  }

  private updateLive() {
    const live = this.engine.live();
    if (!live) {
      this.els.live.textContent = this.busy ? 'saving…' : '';
      this.els.liveRoots.replaceChildren();
      return;
    }
    const seconds = (live.elapsedMs / 1000).toFixed(1);
    this.els.live.textContent = `${seconds}s · C ${live.commitsInScope}/${live.commits} · R ${live.renders} · ${live.rendersPerSec}/s`;
    // Leading roots as they are: what is flashing right now, without stopping the recording.
    this.els.liveRoots.replaceChildren(
      ...live.topRoots.map((r) =>
        h('div', { class: 'line' }, h('span', { class: 'n' }, r.name), ` ×${r.hits} · ${r.perHit}/hit `, h('span', { class: 'why' }, r.reason))
      )
    );
    this.els.scope.dataset.lost = String(live.scopeState === 'lost');
    if (live.scopeState === 'lost') this.els.scope.textContent = `${this.scope?.name ?? ''} (unmounted)`;
  }

  /** Names being followed, each removable; during a recording they are shown but not editable. */
  private renderWatch(recording: boolean) {
    const chips = this.state.watch.map((name) => {
      const chip = h('button', { class: 'chip', 'data-rpr': 'watched', 'data-name': name, title: 'Stop following this component' }, `${name} ×`);
      chip.disabled = recording;
      chip.addEventListener('click', () => this.toggleWatch(name));
      return chip;
    });
    this.els.watch.replaceChildren(...(chips.length ? [h('span', { class: 'muted' }, 'Watching:'), ...chips] : []));
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
    clearResult(this.els.result);
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
      const recording = await this.engine.stop();
      renderResult(this.els.result, recording, () => clearResult(this.els.result));
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
      const area = h('textarea');
      area.value = text;
      this.shadow.append(area);
      area.select();
      document.execCommand('copy');
      area.remove();
    }
    this.say(done, 'muted');
  }

  private onPicked(owner: Owner | null) {
    clearTree(this.els.picker);
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
    renderTree(this.els.picker, {
      rows,
      active,
      actions,
      showLibrary: this.state.showWrappers,
      watched: this.state.watch,
      onShowLibrary: (on) => {
        this.state.showWrappers = on;
        this.persist();
        this.picker.refresh();
      },
      onWatch: (name) => this.toggleWatch(name),
      onCopy: (owner) => void this.copy(describeArea(this.engine, owner.fiber), `${owner.name} copied: paste it into the chat with the assistant.`),
    });
  }

  private say(text: string, kind: 'error' | 'notice' | 'muted' = 'muted') {
    this.els.message.className = kind;
    this.els.message.textContent = text;
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

  private enableDrag(handle: HTMLElement, root: HTMLDivElement) {
    handle.addEventListener('pointerdown', (down) => {
      if ((down.target as Element).closest('button')) return;
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
    });
  }

  private persist() {
    saveState(this.state);
  }
}

function scopeNames(scope: ScopeHandle): string[] {
  return scope.chain
    .map((f) => {
      const t = f.type;
      if (typeof t === 'function') return t.displayName || t.name;
      if (t && typeof t === 'object') return t.displayName || t.render?.displayName || t.render?.name || t.type?.displayName || t.type?.name;
      return null;
    })
    .filter((n): n is string => Boolean(n))
    .slice(-6);
}

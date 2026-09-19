import type { Engine, Owner, Saved } from '../core/engine';
import type { ScopeHandle } from '../core/scope';
import type { Highlighter } from '../overlay/highlight';
import { summarize, type RootLine } from '../shared/summary';
import { Picker } from './picker';
import { defaults, loadState, saveState, type Corner, type PanelState } from './storage';
import { STYLES } from './styles';

export interface PanelOptions {
  corner: Corner;
  highlight: boolean;
  shortcuts: { record: string; pick: string };
  interrupted: { id: string } | null;
}

type El<K extends keyof HTMLElementTagNameMap> = HTMLElementTagNameMap[K];

function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string> = {}, ...children: Array<Node | string | null>): El<K> {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key === 'class') el.className = value;
    else el.setAttribute(key, value);
  }
  for (const child of children) if (child != null) el.append(child);
  return el;
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
  private liveTimer: ReturnType<typeof setInterval> | null = null;
  private picker: Picker;
  private busy = false;
  private els!: {
    live: HTMLSpanElement;
    record: HTMLButtonElement;
    stop: HTMLButtonElement;
    pick: HTMLButtonElement;
    scope: HTMLSpanElement;
    clearScope: HTMLButtonElement;
    lastScope: HTMLButtonElement;
    highlight: HTMLInputElement;
    label: HTMLInputElement;
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
      showOwners: (owners, active, select, hover) => this.showOwners(owners, active, select, hover),
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
    highlighter.enabled = this.state.highlight;
  }

  /** Panel host goes on <html>, outside body: the app's root lookups and DOM observers never see it. */
  mount() {
    document.documentElement.appendChild(this.host);
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
  }

  private initialVisibility() {
    const flag = new URLSearchParams(location.search).get('rpr');
    if (flag === 'panel') this.state.visible = true;
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
    const stop = h('button', { class: 'stop', 'data-rpr': 'stop', title: `Stop (${this.options.shortcuts.record})` }, '■ Stop');
    const pick = h('button', { 'data-rpr': 'pick', title: `Pick an area (${this.options.shortcuts.pick})` }, '⌖ Area');
    const scope = h('span', { class: 'scope', 'data-rpr': 'scope' }, 'Whole app');
    const clearScope = h('button', { 'data-rpr': 'clear-scope', title: 'Record the whole app' }, '×');
    const lastScope = h('button', { 'data-rpr': 'last-scope', title: 'Find the last area again' }, '↺');
    const highlight = h('input', { type: 'checkbox', 'data-rpr': 'highlight' });
    const label = h('input', { type: 'text', 'data-rpr': 'label', placeholder: 'label (optional)' });
    const picker = h('div', { class: 'picker', 'data-rpr': 'picker' });
    const result = h('div', { class: 'result', 'data-rpr': 'result' });
    const message = h('div', { 'data-rpr': 'message' });
    card.append(
      header,
      h('div', { class: 'row' }, record, stop, pick, scope, clearScope, lastScope, h('label', { class: 'toggle' }, highlight, 'highlight')),
      h('div', { class: 'row' }, label),
      picker,
      message,
      result
    );
    const dot = h('button', { class: 'dot', 'data-rpr': 'toggle', title: `react-perf-recorder (${this.options.shortcuts.record})` }, '●');
    const root = h('div', { class: 'rpr' }, dot, card);
    this.els = { live, record, stop, pick, scope, clearScope, lastScope, highlight, label, picker, result, message };
    highlight.checked = this.state.highlight;
    label.value = this.state.label;
    dot.addEventListener('click', () => this.setCollapsed(false));
    collapse.addEventListener('click', () => this.setCollapsed(true));
    record.addEventListener('click', () => void this.start());
    stop.addEventListener('click', () => void this.stop());
    pick.addEventListener('click', () => this.togglePicker());
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
      if (this.highlighter) this.highlighter.enabled = highlight.checked;
      this.persist();
    });
    label.addEventListener('input', () => {
      this.state.label = label.value;
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
    this.els.stop.hidden = !recording;
    this.els.pick.disabled = recording;
    this.els.clearScope.hidden = !this.scope || recording;
    this.els.lastScope.hidden = Boolean(this.scope) || !this.state.lastScope || recording;
    this.els.lastScope.title = this.state.lastScope ? `Find ${this.state.lastScope.label} again` : '';
    this.els.scope.textContent = this.scope ? `${this.scope.name}` : 'Whole app';
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
      return;
    }
    const seconds = (live.elapsedMs / 1000).toFixed(1);
    this.els.live.textContent = `${seconds}s · C ${live.commitsInScope}/${live.commits} · R ${live.renders}`;
    this.els.scope.dataset.lost = String(live.scopeState === 'lost');
    if (live.scopeState === 'lost') this.els.scope.textContent = `${this.scope?.name ?? ''} (unmounted)`;
  }

  private async start() {
    if (this.engine.recording || this.busy) return;
    this.picker.cancel();
    this.els.result.replaceChildren();
    this.say('');
    try {
      this.highlighter?.reset();
      this.engine.start({ source: 'panel', scope: this.scope, label: this.state.label || undefined, highlight: this.state.highlight });
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
      this.renderResult(recording);
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
    this.say('Hover the page and click an element; ↑/↓ choose the component, Enter confirms, Esc cancels.', 'muted');
    this.picker.start();
  }

  private onPicked(owner: Owner | null) {
    this.els.picker.replaceChildren();
    this.say('');
    if (owner) this.setScope(this.engine.scopeFromFiber(owner.fiber));
  }

  private setScope(scope: ScopeHandle | null) {
    this.scope = scope;
    this.state.lastScope = scope ? { names: scopeNames(scope), label: scope.name } : null;
    this.persist();
    this.sync();
  }

  private showOwners(owners: Owner[], active: number, select: (index: number) => void, hover: (index: number) => void) {
    const wrappers = h('input', { type: 'checkbox' });
    wrappers.checked = this.state.showWrappers;
    wrappers.addEventListener('change', () => {
      this.state.showWrappers = wrappers.checked;
      this.persist();
      this.picker.refresh();
    });
    const list = h('ul');
    owners.forEach((owner, i) => {
      const item = h(
        'li',
        { 'data-active': String(i === active), 'data-wrapper': String(owner.wrapper) },
        h('span', {}, owner.name),
        h('span', { class: 'src' }, owner.source)
      );
      item.addEventListener('click', () => select(i));
      item.addEventListener('mouseenter', () => hover(i));
      list.append(item);
    });
    this.els.picker.replaceChildren(
      h('div', { class: 'row' }, h('span', { class: 'muted' }, 'Record inside:'), h('label', { class: 'toggle' }, wrappers, 'show wrappers')),
      list
    );
  }

  private renderResult(rec: Saved) {
    const s = summarize(rec, 5);
    const t = s.totals;
    const out: Node[] = [];
    const line = (...parts: Array<Node | string>) => h('div', { class: 'line' }, ...parts);
    const n = (text: string | number) => h('span', { class: 'n' }, String(text));
    const why = (text: string) => h('span', { class: 'why' }, text);
    out.push(
      line(
        `${s.durationSec}s · `,
        n(t.commitsInScope),
        ` commits${s.scope ? ' in area' : ''} (${t.commits} total) · `,
        n(t.renders),
        ` renders · ${t.rendersPerScopeCommit}/commit · ${t.rendersWithoutDom} without DOM change`,
        t.rendersFromOutside ? ` · ${t.rendersFromOutside} from outside` : ''
      )
    );
    const section = (title: string, rows: Node[]) => rows.length && out.push(h('div', { class: 'section' }, h('h4', {}, title), ...rows));
    section(
      'Actions',
      s.actions.map((a) =>
        line(
          `${a.atSec}s ${a.what} — `,
          n(a.renders),
          ` renders, ${a.commits} commits`,
          a.perChar ? ` (${a.perChar})` : '',
          a.latencyMs ? ` · ${a.latencyMs}ms` : '',
          a.topRoot ? ` · ` : '',
          a.topRoot ? why(a.topRoot) : ''
        )
      )
    );
    const rootRows = (roots: RootLine[]) =>
      roots.map((r) =>
        line(
          n(r.root),
          ` ×${r.hits} · ${r.perHit}/hit${r.instances > 1 ? ` · ${r.instances} inst` : ''}${r.noDomChange ? ` · ${r.noDomChange} no-DOM` : ''} `,
          why(r.reasons.join('; '))
        )
      );
    section('Roots', rootRows(s.topRoots));
    section('From outside the area', rootRows(s.outsideRoots));
    section(
      'Causes',
      s.topCauses.map((c) => line(n(c.commits), ` commits ← ${c.key}`, c.keys ? why(` · ${c.keys}`) : ''))
    );
    section(
      'Components',
      rec.components
        .slice(0, 8)
        .map((c) =>
          line(
            n(c.renders),
            ` ${c.name}${c.memo ? ' (memo)' : ''}${c.withoutDom ? ` · ${c.withoutDom} no-DOM` : ''} `,
            why(c.reasons.map(([r, k]) => `${k}× ${r}`).join('; '))
          )
        )
    );
    for (const [name, plugin] of Object.entries(s.plugins))
      section(
        name,
        plugin.highlights.slice(0, 2).map((text) => line(text))
      );
    if (s.warnings.length)
      section(
        'Warnings',
        s.warnings.slice(0, 3).map((w) => line(w))
      );
    const copy = h('button', {}, 'Copy id');
    const download = h('button', {}, 'Download');
    const dismiss = h('button', {}, 'Dismiss');
    copy.addEventListener('click', () => void navigator.clipboard?.writeText(rec.id ?? ''));
    download.addEventListener('click', () => downloadJson(rec));
    dismiss.addEventListener('click', () => this.els.result.replaceChildren());
    copy.hidden = !rec.id;
    out.push(
      h(
        'div',
        { class: 'row section' },
        rec.id ? h('span', { class: 'muted' }, `saved ${rec.id}`) : h('span', { class: 'error' }, rec.saveError ?? 'not saved'),
        copy,
        download,
        dismiss
      )
    );
    this.els.result.replaceChildren(...out);
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

function downloadJson(rec: Saved) {
  const blob = new Blob([JSON.stringify(rec, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `react-perf-recorder-${rec.id ?? rec.startedAt.replace(/[:.]/g, '-')}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

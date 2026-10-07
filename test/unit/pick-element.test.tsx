import fs from 'node:fs';
import { memo, version, type ReactNode } from 'react';
import { Engine, type Owner } from '../../src/core/engine';
import { PluginHost } from '../../src/core/plugins';
import type { Fiber } from '../../src/core/fiber';
import { describeArea } from '../../src/ui/describe';
import { Picker, type TreeRow } from '../../src/ui/picker';
import { config, mount } from './helpers';

function Card({ children }: { children: ReactNode }) {
  return <section className="card">{children}</section>;
}

function Attract() {
  return (
    <div className="screen">
      <Card>
        <button className="btn btn-primary" data-testid="cta">
          Нажми, чтобы сыграть
        </button>
      </Card>
      <p className="tagline">
        <svg className="icon" viewBox="0 0 8 8">
          <path d="M0 0h8v8z" />
        </svg>
        Try it
      </p>
    </div>
  );
}

const App = () => (
  <main id="app">
    <Attract />
  </main>
);

/** The line of this file the button's JSX starts on, as React 18 reports it. */
const buttonLine =
  fs
    .readFileSync(__filename, 'utf8')
    .split('\n')
    .findIndex((line) => line.includes('<button className="btn')) + 1;

const setup = () => {
  mount(<App />);
  const engine = new Engine({ ...config, endpoint: null }, new PluginHost([]));
  const button = document.querySelector('[data-testid="cta"]')!;
  return { engine, button };
};

describe('an element picked on the page', () => {
  it('is an owner of its own above the components it sits in, which owners(el) still lists alone', () => {
    const { engine, button } = setup();
    const host = engine.hostAt(button)!;
    expect(host.stateNode).toBe(button);
    const owners = engine.ownersOfFiber(host);
    expect(owners.map((o) => o.name)).toEqual(['<button.btn.btn-primary>', 'Card', 'Attract', 'App']);
    expect(owners[0]).toMatchObject({ element: true, wrapper: false, library: false, provider: false });
    expect(engine.owners(button).map((o) => o.name)).toEqual(['Card', 'Attract', 'App']);
    // The line of the JSX itself, not of the component: React 18 has it exact, React 19 once the dev server maps it.
    expect(owners[0].source).toMatch(new RegExp(`pick-element\\.test\\.tsx(:${buttonLine})?$`));
    if (version.startsWith('18')) expect(owners[0].source).toBe(`test/unit/pick-element.test.tsx:${buttonLine}`);
  });

  it('is an icon as a whole: a click on a path of an svg takes the svg', () => {
    const { engine } = setup();
    const host = engine.hostAt(document.querySelector('path')!)!;
    expect(engine.ownerOf(host).name).toBe('<svg.icon>');
  });

  it('is described for an assistant with the component that wrote it, the line of its JSX and a selector', () => {
    const { engine, button } = setup();
    const text = describeArea(engine, engine.hostAt(button)!);
    const lines = text.split('\n');
    expect(lines[0]).toMatch(/^React element on /);
    expect(lines).toContain('Element: <button data-testid="cta" class="btn btn-primary"> "Нажми, чтобы сыграть"');
    // Written in Attract, though Card is the component above it in the tree: Attract's render made the element.
    expect(text).toMatch(new RegExp(`^Written in: Attract — test/unit/pick-element\\.test\\.tsx(:${buttonLine})?$`, 'm'));
    expect(lines).toContain('Path: App › Attract › Card › <button.btn.btn-primary>');
    const selector = /^Selector: (.+)$/m.exec(text)![1];
    expect([...document.querySelectorAll(selector)]).toEqual([button]);
    // Scripts get the component's scope: an element renders only with it.
    expect(lines.at(-1)).toBe('react-perf-recorder scope: {"names":["App","Attract","Card"]}');
  });

  it('builds a selector past siblings of the same tag', () => {
    mount(
      <ul>
        <li>
          <b>one</b>
        </li>
        <li>
          <b>two</b>
        </li>
      </ul>
    );
    const engine = new Engine({ ...config, endpoint: null }, new PluginHost([]));
    const second = document.querySelectorAll('b')[1];
    const selector = /^Selector: (.+)$/m.exec(describeArea(engine, engine.hostAt(second)!))![1];
    expect([...document.querySelectorAll(selector)]).toEqual([second]);
  });
});

describe('the picker on an element', () => {
  let picker: Picker;
  afterEach(() => picker?.cancel());

  const start = (engine: Engine, under: Element, filters = { elements: true }) => {
    const host = document.createElement('div');
    document.documentElement.appendChild(host);
    const shadow = host.attachShadow({ mode: 'open' });
    const calls: Array<[string, string | null, string | null]> = [];
    const view: { rows: TreeRow[]; active: number } = { rows: [], active: -1 };
    const name = (o: Owner | 'whole-app' | null) => (o && typeof o === 'object' ? o.name : o);
    picker = new Picker(shadow, host, engine, () => ({ library: false, providers: false, ...filters }), {
      showTree: (rows, active) => Object.assign(view, { rows, active }),
      preview: (owner, element) => calls.push(['preview', name(owner), name(element)]),
      done: (choice, element) => calls.push(['done', name(choice), name(element)]),
    });
    document.elementsFromPoint = () => [under, document.body];
    picker.start();
    const key = (k: string) => window.dispatchEvent(new KeyboardEvent('keydown', { key: k }));
    const tag = () => shadow.querySelector('.box .tag')!.textContent;
    return { calls, view, key, tag, active: () => view.rows[view.active]?.owner.name };
  };

  it('outlines and takes the element under the cursor, a row under its component; ← and Enter take the component', () => {
    const { engine, button } = setup();
    button.getBoundingClientRect = () => new DOMRect(10, 10, 120, 30);
    const { calls, view, key, tag, active } = start(engine, button);

    button.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, composed: true, clientX: 20, clientY: 20 }));
    expect(tag()).toBe('Card › <button.btn.btn-primary>');

    button.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true, clientX: 20, clientY: 20 }));
    expect(view.rows.map((r) => r.owner.name)).toEqual(['App', 'Attract', 'Card', '<button.btn.btn-primary>']);
    expect(active()).toBe('<button.btn.btn-primary>');
    // An element's row is a leaf: what is inside it is listed under the component.
    expect(view.rows.at(-1)!.toggle).toBeNull();
    // The area is the component the element sits in; the element rides along for ⧉ and the outline.
    expect(calls.at(-1)).toEqual(['preview', 'Card', '<button.btn.btn-primary>']);

    key('ArrowLeft');
    expect(active()).toBe('Card');
    expect(calls.at(-1)).toEqual(['preview', 'Card', null]);
    // ↓ from the component lands on its element first.
    key('ArrowDown');
    expect(active()).toBe('<button.btn.btn-primary>');
    key('Enter');
    expect(calls.at(-1)).toEqual(['done', 'Card', '<button.btn.btn-primary>']);
  });

  it('takes the component under the cursor while elements are off, and drops an element held from before', () => {
    const { engine, button } = setup();
    for (const el of [button, document.querySelector('.card')!]) el.getBoundingClientRect = () => new DOMRect(10, 10, 120, 30);
    const filters = { elements: false };
    const { calls, view, tag, active } = start(engine, button, filters);

    button.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, composed: true, clientX: 20, clientY: 20 }));
    expect(tag()).toBe('Card');
    button.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true, clientX: 20, clientY: 20 }));
    expect(view.rows.map((r) => r.owner.name)).toEqual(['App', 'Attract', 'Card']);
    expect(active()).toBe('Card');
    expect(calls.at(-1)).toEqual(['preview', 'Card', null]);

    // Ticked on an element's row and unticked again: the tree steps out to its component.
    filters.elements = true;
    picker.startAt(engine.hostAt(button) as Fiber);
    expect(active()).toBe('<button.btn.btn-primary>');
    filters.elements = false;
    picker.refresh();
    expect(active()).toBe('Card');
    expect(view.rows.some((r) => r.owner.element)).toBe(false);
    expect(calls.at(-1)).toEqual(['preview', 'Card', null]);
  });

  it('reopens on the element it was closed on', () => {
    const { engine, button } = setup();
    const { calls, view, active } = start(engine, button);
    picker.startAt(engine.hostAt(button) as Fiber);
    expect(active()).toBe('<button.btn.btn-primary>');
    expect(view.rows.at(-2)!.owner.name).toBe('Card');
    expect(calls.at(-1)).toEqual(['preview', 'Card', '<button.btn.btn-primary>']);
  });

  it('keeps a component row above an element even when the filters hide every component there is', () => {
    const Bare = memo(() => <span className="bare">x</span>);
    mount(<Bare />);
    const engine = new Engine({ ...config, endpoint: null }, new PluginHost([]));
    const span = document.querySelector('.bare')!;
    const { calls, view, active } = start(engine, span);
    // A click finds nothing the tree shows, so it takes nothing…
    span.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }));
    expect(view.rows).toEqual([]);
    // …but an element the panel already holds keeps the component it is recorded as.
    picker.startAt(engine.hostAt(span) as Fiber);
    expect(view.rows.map((r) => r.owner.name)).toEqual([view.rows[0].owner.name, '<span.bare>']);
    expect(view.rows[0].owner.wrapper).toBe(true);
    expect(active()).toBe('<span.bare>');
    expect(calls.at(-1)).toEqual(['preview', view.rows[0].owner.name, '<span.bare>']);
  });

  it('leaves a page outside every component alone', () => {
    const { engine } = setup();
    const stray = document.createElement('div');
    document.body.appendChild(stray);
    const { calls, view } = start(engine, stray);
    stray.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }));
    expect(view.rows).toEqual([]);
    expect(calls).toEqual([]);
  });
});

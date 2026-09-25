/** @jsxImportSource preact */
import { render } from 'preact';
import { act } from 'preact/test-utils';
import type { ReasonInfo } from '../../src/shared/schema';
import { Notice, StatCard } from '../../src/ui/components/Stats';

const store: ReasonInfo = {
  i: 0,
  kind: 'store',
  hook: 2,
  store: 'useChatStore',
  selector: '(s)=>selectMessageInfo(s, id)',
  sameContent: true,
};

const hook = {
  type: 'useSyncExternalStore',
  path: ['useMessageInfo', 'useBoundStore', 'useStore', 'SyncExternalStore'],
  library: 'zustand',
  libraryAt: 1,
  site: 'src/components/Messages.tsx:21',
  code: 'const info = useMessageInfo(id);',
};

const draw = (node: preact.ComponentChild) => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  render(node, host);
  return host;
};

const text = (host: HTMLElement, selector: string) => host.querySelector(selector)?.textContent ?? '';

describe('a component of the report', () => {
  it('draws the reason in its parts and opens the hook behind it', () => {
    const host = draw(
      <StatCard
        name="Status"
        source="src/components/Messages.tsx:5"
        badges={[
          { text: '×15', tone: 'count' },
          { text: '1407 no-DOM', tone: 'warn' },
        ]}
        reasons={[{ id: 0, n: 1407, reason: store, hook }]}
      />
    );
    // The head says what it is and how much it cost; the file keeps only its name, the full path is in the title.
    expect(text(host, '.stat-name')).toBe('Status');
    expect([...host.querySelectorAll('.badge')].map((b) => b.textContent)).toEqual(['×15', '1407 no-DOM']);
    expect(text(host, '.stat-src .copy-text')).toBe('Messages.tsx:5');
    expect(host.querySelector('.stat-src')?.getAttribute('title')).toContain('src/components/Messages.tsx:5');

    // The kind is a chip of its own and the words beside it never repeat it: `store` · `useChatStore`.
    expect(text(host, '.kind')).toBe('store');
    expect(text(host, '.what')).toBe('useChatStore');
    expect(text(host, '.flag')).toBe('same content');

    // Closed by default, and one click brings the selector, the chain, the line and the code under it. The row is a
    // button that says whether it is open, so a keyboard and a screen reader get to it too.
    expect(host.querySelector('.reason-body')).toBeNull();
    expect(host.querySelector('.reason-head')?.tagName).toBe('BUTTON');
    expect(host.querySelector('.reason-head')?.getAttribute('aria-expanded')).toBe('false');
    act(() => (host.querySelector('.reason-head') as HTMLElement).click());
    expect(text(host, '.reason-body .sel')).toBe('(s)=>selectMessageInfo(s, id)');
    expect(text(host, '.reason-body .chain')).toBe('useMessageInfo › zustand.useBoundStore');
    expect(host.querySelector('.reason-body .chain')?.getAttribute('title')).toContain('[zustand] useBoundStore');
    expect(text(host, '.reason-body .site .copy-text')).toBe('src/components/Messages.tsx:21');
    // Copying the line turns its icon into a tick for a moment, where the pointer already is.
    expect(text(host, '.reason-body .site .copy-mark')).toBe('⧉');
    act(() => (host.querySelector('.reason-body .site') as HTMLElement).click());
    expect(host.querySelector('.reason-body .site')?.getAttribute('data-copied')).toBe('true');
    expect(text(host, '.reason-body .site .copy-mark')).toBe('✓');
    expect(text(host, '.reason-body .code')).toBe('const info = useMessageInfo(id);');
    expect(host.querySelector('.reason-head')?.getAttribute('aria-expanded')).toBe('true');
    render(null, host);
  });

  it('opens the leading reason of a root, and never opens one with nothing under it', () => {
    const parent: ReasonInfo = { i: 1, kind: 'parent', changed: ['active'], sameRef: ['onPick'] };
    const host = draw(<StatCard name="Tab" badges={[]} reasons={[{ id: 1, n: 2, reason: parent }]} openFirst />);
    expect(text(host, '.what')).toBe('active');
    expect(text(host, '.reason-head .muted')).toBe('new ref, same content: onPick');
    // Nothing to open: no twisty, no body, and the row does not answer a click.
    expect(text(host, '.tw')).toBe('');
    expect(host.querySelector('.reason-head')?.getAttribute('data-clickable')).toBeNull();
    act(() => (host.querySelector('.reason-head') as HTMLElement).click());
    expect(host.querySelector('.reason-body')).toBeNull();
    render(null, host);
  });

  it('opens the first reason of a root on its own', () => {
    const host = draw(<StatCard name="Status" badges={[]} reasons={[{ id: 0, n: 1407, reason: store, hook }]} openFirst />);
    expect(text(host, '.reason-body .sel')).toBe('(s)=>selectMessageInfo(s, id)');
    render(null, host);
  });
});

describe('a warning of the recording', () => {
  it('reads as a headline and the reason behind it', () => {
    const host = draw(<Notice text="highlight was on: drawing the outlines costs main-thread time" />);
    expect(text(host, '.notice-head')).toBe('highlight was on');
    expect(text(host, '.notice-text')).toContain('drawing the outlines costs main-thread time');
    expect(text(host, '.notice-icon')).toBe('i');
    expect(host.querySelector('.notice-card')?.getAttribute('data-tone')).toBeNull();
    render(null, host);
  });

  it('marks an error as one', () => {
    const host = draw(<Notice text="error: the page went away mid-commit" />);
    expect(host.querySelector('.notice-card')?.getAttribute('data-tone')).toBe('bad');
    expect(text(host, '.notice-icon')).toBe('!');
    expect(text(host, '.notice-head')).toBe('error');
    render(null, host);
  });
});

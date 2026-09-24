import { Profiler, useState } from 'react';
import { replay } from '../../src/client/replay';
import { mount } from './helpers';

/** A menu that opens as the button goes down and picks on the click, the way many menus do. */
function Menu() {
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState(0);
  return (
    <button type="button" data-testid="menu" onPointerDown={() => setOpen(true)} onClick={() => setPicked((n) => n + 1)}>
      {open ? 'open' : 'closed'} {picked}
    </button>
  );
}

describe('replay', () => {
  it('does the events of a click in tasks of their own, so React commits after each as it does for a person', async () => {
    let commits = 0;
    mount(
      <Profiler id="menu" onRender={() => commits++}>
        <Menu />
      </Profiler>
    );
    await new Promise((r) => setTimeout(r, 20));
    commits = 0;
    await replay({
      steps: [{ kind: 'click', afterMs: 0, durationMs: 0, what: 'click «menu»', selector: '[data-testid="menu"]' }],
      tailMs: 0,
      skipped: [],
    });
    await new Promise((r) => setTimeout(r, 20));
    expect(document.querySelector('[data-testid="menu"]')!.textContent).toBe('open 1');
    // pointerdown opens, click picks: two commits, not one.
    expect(commits).toBe(2);
  });
});

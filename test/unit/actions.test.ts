import { ActionTracker } from '../../src/core/actions';
import type { ActionRecord } from '../../src/shared/schema';

const track = () => {
  const actions: ActionRecord[] = [];
  const tracker = new ActionTracker(
    { values: false, secretSelector: '', wrapperPattern: /^$/, projectRoot: '', ownHost: null, inScope: () => undefined },
    () => performance.now(),
    (a) => actions.push(a)
  );
  tracker.start();
  return { actions, stop: () => tracker.stop() };
};

describe('ActionTracker', () => {
  it('records a checkbox and a select by their click and change, not as typing', () => {
    document.body.innerHTML = '<input type="checkbox" data-testid="box"><select data-testid="pick"><option>a</option><option>b</option></select>';
    const { actions, stop } = track();
    const box = document.querySelector('input')!;
    // A click on a checkbox fires input and change after it, as a browser does; a choice in a select fires both too.
    box.click();
    const select = document.querySelector('select')!;
    select.dispatchEvent(new Event('input', { bubbles: true }));
    select.dispatchEvent(new Event('change', { bubbles: true }));
    stop();
    expect(actions.map((a) => [a.kind, a.target?.testId])).toEqual([
      ['click', 'box'],
      ['change', 'box'],
      ['change', 'pick'],
    ]);
  });

  it('records a drag as a drag, and not the click its release ends in', () => {
    document.body.innerHTML = '<div data-testid="card"><span>Task 1</span></div>';
    const { actions, stop } = track();
    const span = document.querySelector('span')!;
    const pointer = (type: string, x: number, buttons: number) =>
      span.dispatchEvent(new MouseEvent(type, { bubbles: true, clientX: x, clientY: 10, button: 0, buttons }));
    pointer('pointerdown', 10, 1);
    pointer('pointermove', 14, 1); // under the threshold: still a press
    pointer('pointermove', 60, 1);
    pointer('pointermove', 110, 1);
    pointer('pointerup', 110, 0);
    span.click();
    stop();
    expect(actions.map((a) => [a.kind, a.target?.testId])).toEqual([['drag', 'card']]);
    expect(actions[0].drag).toEqual({ dx: 100, dy: 0, pixels: 100 });
  });

  it('counts a scroll sideways, which a board or a carousel does', () => {
    document.body.innerHTML = '<div data-testid="board" style="overflow-x:auto"></div>';
    const { actions, stop } = track();
    const board = document.querySelector('div')!;
    for (const left of [0, 40, 120]) {
      Object.defineProperty(board, 'scrollLeft', { value: left, configurable: true });
      board.dispatchEvent(new Event('scroll'));
    }
    stop();
    expect(actions[0]).toMatchObject({ kind: 'scroll', scroll: { pixels: 120, left: { from: 0, to: 120 } } });
  });

  it('still records typing into a text field', () => {
    document.body.innerHTML = '<input type="text" data-testid="q">';
    const { actions, stop } = track();
    const field = document.querySelector('input')!;
    for (const ch of 'hi') {
      field.value += ch;
      field.dispatchEvent(new Event('input', { bubbles: true }));
    }
    stop();
    expect(actions).toMatchObject([{ kind: 'typing', chars: 2, target: { testId: 'q' } }]);
  });
});

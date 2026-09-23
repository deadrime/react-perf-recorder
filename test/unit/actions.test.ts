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

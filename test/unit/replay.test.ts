// @vitest-environment node
import { planReplay } from '../../src/shared/replay';
import type { ActionRecord } from '../../src/shared/schema';

const at = (id: number, atMs: number, rest: Partial<ActionRecord>): ActionRecord => ({ id, kind: 'click', atMs, endMs: atMs, ...rest });
const button = (text: string, extra = {}) => ({ tag: 'button', text, selector: `button`, ...extra });

describe('planReplay', () => {
  it('keeps the gaps, spreads typing and ends with the tail of the original', () => {
    const plan = planReplay({
      id: 'rec-1',
      durationMs: 9000,
      actions: [
        at(1, 5000, { target: button('Add', { nth: 2 }) }),
        at(2, 5800, { kind: 'typing', endMs: 6400, chars: 5, length: 5, target: { tag: 'input', selector: '[data-testid="q"]' } }),
        at(3, 7000, { kind: 'key', key: 'Enter', target: { tag: 'input', selector: '[data-testid="q"]' } }),
      ],
    });
    expect(plan.from).toBe('rec-1');
    // A long wait before the first action is cut short; the gaps after it are kept.
    expect(plan.steps.map((s) => [s.kind, s.afterMs])).toEqual([
      ['click', 2000],
      ['typing', 800],
      ['key', 1200],
    ]);
    expect(plan.steps[0]).toMatchObject({ selector: 'button', nth: 2, what: 'click «Add»' });
    expect(plan.steps[1]).toMatchObject({ chars: 5, durationMs: 600 });
    expect(plan.steps[1].value).toBeUndefined();
    expect(plan.tailMs).toBe(2000);
  });

  it('does a gesture once: the click, not also the submit or change it set off', () => {
    const plan = planReplay({
      durationMs: 3000,
      actions: [
        at(1, 100, { target: button('Save') }),
        at(2, 110, { kind: 'submit', target: { tag: 'form', selector: 'form' } }),
        at(3, 500, { target: { tag: 'label', text: 'Dense', selector: 'label' } }),
        at(4, 505, { target: { tag: 'input', selector: 'input[type="checkbox"]' } }),
        at(5, 510, { kind: 'change', target: { tag: 'input', selector: 'input[type="checkbox"]' } }),
        // Enter submits in a browser, not when a script presses it: this submit stays.
        at(6, 900, { kind: 'key', key: 'Enter', target: { tag: 'input', selector: 'input' } }),
        at(7, 905, { kind: 'submit', target: { tag: 'form', selector: 'form' } }),
      ],
    });
    expect(plan.steps.map((s) => s.kind)).toEqual(['click', 'click', 'key', 'submit']);
    expect(plan.steps[1].what).toBe('click «Dense»');
  });

  it('lists what it cannot do again instead of guessing', () => {
    const plan = planReplay({
      durationMs: 2000,
      actions: [
        at(1, 100, { kind: 'navigation', url: '/back' }),
        at(2, 300, { kind: 'change', target: { tag: 'select', selector: 'select' } }),
        at(3, 600, { target: { tag: 'div' } }),
      ],
    });
    expect(plan.steps).toEqual([]);
    expect(plan.skipped).toHaveLength(3);
    expect(plan.skipped[1]).toMatch(/chosen option was not recorded/);
  });
});

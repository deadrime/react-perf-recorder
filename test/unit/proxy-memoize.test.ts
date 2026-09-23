import { memoize, memoizeWithArgs } from 'proxy-memoize';
import { createMemoInstrumentation } from '../../src/runtime/memo';

type State = { items: Record<string, { price: number; name: string }>; tick: number };

const makeState = (tick: number, price = 1): State => ({ items: { a: { price, name: 'A' }, b: { price: 2, name: 'B' } }, tick });

describe('memo instrumentation', () => {
  it('does not change what proxy-memoize computes, nested calls included', () => {
    const run = (wrap: boolean) => {
      const memo = createMemoInstrumentation();
      const m = wrap ? memo.instrument(memoize, 'memoize', 0) : memoize;
      const mw = wrap ? memo.instrument(memoizeWithArgs, 'memoizeWithArgs', 0) : memoizeWithArgs;
      let computed = 0;
      const selectItem = mw((state: State, id: string) => {
        computed++;
        return { ...state.items[id] };
      });
      const selectTotal = m((state: State) => {
        computed++;
        return selectItem(state, 'a').price + selectItem(state, 'b').price;
      });
      if (wrap) memo.start();
      const results: unknown[] = [];
      let state = makeState(0);
      for (let i = 0; i < 20; i++) {
        if (i % 5 === 0) state = makeState(i, i);
        else if (i % 3 === 0) state = { ...state, tick: i };
        results.push(selectTotal(state), selectItem(state, i % 2 ? 'a' : 'b'));
      }
      return { results: JSON.stringify(results), computed, stats: wrap ? memo.stop() : [] };
    };
    const plain = run(false);
    const wrapped = run(true);
    expect(wrapped.results).toBe(plain.results);
    expect(wrapped.computed).toBe(plain.computed);
    expect(wrapped.stats.find((s) => s.kind === 'memoizeWithArgs')!.nestedCalls).toBeGreaterThan(0);
  });

  it('flags a one-slot cache evicted by alternating arguments', () => {
    const memo = createMemoInstrumentation();
    const mw = memo.instrument(memoizeWithArgs, 'memoizeWithArgs', 0);
    const small = mw((state: State, id: string) => ({ ...state.items[id] }));
    const big = mw((state: State, id: string) => ({ ...state.items[id] }), { size: 8 });
    memo.name(small, 'selectSmall', 'src/a.ts');
    memo.name(big, 'selectBig', 'src/a.ts');
    memo.start();
    const state = makeState(0);
    for (let i = 0; i < 40; i++) {
      small(state, i % 2 ? 'a' : 'b');
      big(state, i % 2 ? 'a' : 'b');
    }
    const stats = memo.stop();
    expect(stats.find((s) => s.name === 'selectSmall')).toMatchObject({ calls: 40, recomputes: 40, thrash: true, distinctArgs: 2, size: 1 });
    expect(stats.find((s) => s.name === 'selectBig')).toMatchObject({ calls: 40, recomputes: 2, thrash: false, size: 8 });
  });

  it('flags a ring with room for every row that still pushes out answers in use', () => {
    // Six rows, eight slots, and one busy row whose data keeps changing: every recompute takes a slot, and the quiet
    // rows' answers, still in use, go once they are the oldest. More slots than rows, renders for nothing all the same.
    const memo = createMemoInstrumentation();
    const mw = memo.instrument(memoizeWithArgs, 'memoizeWithArgs', 0);
    const ring = mw((state: Record<string, number>, id: string) => ({ id, n: state[id] }), { size: 8 });
    memo.name(ring, 'selectRow', 'src/a.ts');
    const ids = ['a', 'b', 'c', 'd', 'e', 'f'];
    let state: Record<string, number> = Object.fromEntries(ids.map((id) => [id, 0]));
    const first = new Map(ids.map((id) => [id, ring(state, id)]));
    memo.start();
    let sameAgain = 0;
    for (let i = 0; i < 60; i++) {
      const changed = 'a';
      state = { ...state, [changed]: state[changed] + 1 };
      for (const id of ids) {
        const answer = ring(state, id);
        if (id !== changed && answer !== first.get(id) && JSON.stringify(answer) === JSON.stringify(first.get(id))) sameAgain++;
        first.set(id, answer);
      }
    }
    const stat = memo.stop().find((s) => s.name === 'selectRow')!;
    expect(sameAgain).toBeGreaterThan(0);
    expect(stat.distinctArgs).toBeLessThanOrEqual(stat.size);
    expect(stat.evictions).toBeGreaterThan(0);
    expect(stat.thrash).toBe(true);
  });

  it('does not call a change of the data an eviction', () => {
    const memo = createMemoInstrumentation();
    const mw = memo.instrument(memoizeWithArgs, 'memoizeWithArgs', 0);
    const one = mw((state: State, id: string) => ({ ...state.items[id] }));
    memo.name(one, 'selectOne', 'src/a.ts');
    memo.start();
    for (let i = 0; i < 30; i++) one(makeState(i, i), 'a');
    expect(memo.stop().find((s) => s.name === 'selectOne')).toMatchObject({ recomputes: 30, evictions: 0, thrash: false });
  });

  it('counts nothing outside a recording', () => {
    const memo = createMemoInstrumentation();
    const m = memo.instrument(memoize, 'memoize', 0);
    const select = m((state: State) => state.tick);
    memo.name(select, 'selectTick', 'src/a.ts');
    select(makeState(1));
    memo.start();
    expect(memo.stop()).toEqual([]);
    expect(memo.label(select)).toBe('selectTick');
  });
});
